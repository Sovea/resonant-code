import { evaluateAdoption, schemas, type Currency, type TaskArtifact, type TaskState, type VerificationInput } from '@sovea/stetra-core';
import type { z } from 'zod';
import { inputError } from '../errors.ts';
import { captureGitWorktree } from '../facts/worktree.ts';
import { captureVerificationInputs, verificationInputSetFingerprint } from '../facts/execution-inputs.ts';
import type { ProjectConfig } from '../schemas/config.ts';
import type { LoadedTask } from './task-store.ts';
import { relatedOperations } from './actions.ts';

export function artifact<K extends TaskArtifact['kind']>(state: TaskState, kind: K, id: string | undefined): Extract<TaskArtifact, { kind: K }> {
  const result = state.records.find((item) => item.id === id);
  if (result?.kind !== kind) throw inputError(`Missing ${kind}: ${id ?? '(none)'}.`);
  return result as Extract<TaskArtifact, { kind: K }>;
}
export function artifacts<K extends TaskArtifact['kind']>(state: TaskState, kind: K): Extract<TaskArtifact, { kind: K }>[] {
  return state.records.filter((item): item is Extract<TaskArtifact, { kind: K }> => item.kind === kind);
}

export function resolveVerification(selection: z.infer<typeof schemas.verificationSelection> | undefined, config: ProjectConfig): VerificationInput {
  const source = selection ?? (config.defaultVerificationProfile ? { mode: 'profile', name: config.defaultVerificationProfile } : undefined);
  if (!source) throw inputError('Declare exact check argv, a project verification profile, or a concrete no-command rationale.');
  if (source.mode !== 'profile') return schemas.verification.parse(source);
  const profile = config.verificationProfiles[source.name];
  if (!profile) throw inputError(`Unknown verification profile: ${source.name}.`);
  return schemas.verification.parse({ mode: 'checks', checks: profile.checks });
}

export async function observeCurrency(task: LoadedTask): Promise<Currency> {
  const snapshot = await captureGitWorktree(task.projectRoot);
  const plan = artifact(task.state, 'verification-plan', task.state.planId);
  return { worktreeFingerprint: snapshot.fingerprint,
    executionInputsFingerprint: verificationInputSetFingerprint(captureVerificationInputs(task.projectRoot, plan.definitions)) };
}

export function decisionView(state: TaskState) {
  const latest = new Map<string, Extract<TaskArtifact, { kind: 'decision-proposal' }>>();
  for (const item of artifacts(state, 'decision-proposal')) latest.set(item.input.key, item);
  return [...latest.values()].map((proposal) => ({ proposal,
    resolution: artifacts(state, 'decision-resolution').reverse().find((item) => item.proposalId === proposal.id && item.intentId === state.intentId) ?? null,
  }));
}

export function observationSummary(state: TaskState, observationId = state.observationId) {
  if (!observationId) return null;
  const observation = artifact(state, 'observation', observationId);
  const plan = artifact(state, 'verification-plan', observation.planId);
  return { id: observation.id, planId: plan.id, fingerprint: observation.data.current.fingerprint,
    changedFiles: observation.data.changedFiles.map(({ id, path, operation, previousPath, representation }) => ({ id, path, operation, previousPath, representation })),
    checks: observation.data.checks.map((check) => ({
      key: plan.definitions.find((definition) => definition.definitionId === check.definitionId)!.key,
      argv: check.assertionArgv, status: check.attempts.at(-1)!.status,
      attempt: check.attempts.at(-1)!.attempt, termination: check.attempts.at(-1)!.termination,
    })),
    verification: { mode: plan.mode, rationale: plan.rationale },
    verifierMutations: observation.data.verifierMutations, checkInducedChanges: observation.data.checkInducedChanges,
    refresh: observation.data.refresh, retry: observation.data.retry,
  };
}

const NEXT_MESSAGES = {
  implement: 'Implement through the Host, then collect the actual changes and frozen checks.',
  'resolve-decision': 'Present the concrete unresolved choice. Continue only investigation or work already authorized independently of that choice.',
  collect: 'The observed result changed. Collect current facts before explaining or adopting it.',
  report: 'Explain the actual implementation and evidence. Failed checks remain engineering evidence for repair or disclosed limitations.',
  assess: 'Use the Host Analyzer for the frozen Analysis Request. Submit an explicit unavailable result if analysis cannot run.',
  prepare: 'Reconcile the Assessment. Investigate, repair, and reassess within existing authority before preparing the final recommendation. Ask only for genuinely new authority or a Human adoption choice.',
  'await-human-decision': 'Present the current Adoption Package and await an exact later Human adoption response.',
  complete: 'The task is closed. Its facts and Human decision remain inspectable.',
};

export function taskResult(task: LoadedTask, status: string, currency?: Currency, options: { adoption?: boolean } = {}) {
  const state = task.state, view = evaluateAdoption(state, currency);
  const intent = artifact(state, 'intent', state.intentId);
  const packet = state.packageId ? artifact(state, 'adoption-package', state.packageId) : null;
  return { protocol: schemas.protocol, schemaVersion: schemas.schemaVersion, status,
    taskId: task.taskId, revision: state.revision, phase: view.phase, factsCurrency: view.factsCurrency,
    directive: { kind: view.next, message: NEXT_MESSAGES[view.next] },
    relatedOperations: relatedOperations(task.taskId, view, state.requestId),
    current: { intentId: state.intentId, observationId: state.observationId, reportId: state.reportId,
      requestId: state.requestId, assessmentId: state.assessmentId, packageId: state.packageId },
    summary: { intendedOutcome: intent.interpretation.desiredOutcome, constraints: intent.interpretation.constraints,
      nonGoals: intent.interpretation.nonGoals, pendingDecisions: view.pendingDecisions,
      observations: observationSummary(state) },
    ...(options.adoption && packet && view.packageBindingsCurrent ? { adoptionBrief: adoptionBrief(task, packet.id, currency) } : {}),
  };
}

export function adoptionBrief(task: LoadedTask, packageId: string, currency?: Currency) {
  const state = task.state, packet = artifact(state, 'adoption-package', packageId);
  const intent = artifact(state, 'intent', packet.basis.intentId);
  const report = artifact(state, 'report', packet.basis.reportId);
  const assessment = artifact(state, 'assessment', packet.assessmentId);
  const request = artifact(state, 'analysis-request', packet.requestId);
  const adoption = artifacts(state, 'adoption-decision').filter((item) => item.packageId === packet.id).at(-1) ?? null;
  return { packageId: packet.id, current: state.packageId === packet.id && evaluateAdoption(state, currency).packageCurrent,
    factsCurrency: evaluateAdoption(state, currency).factsCurrency,
    recommendation: packet.input.recommendation,
    humanChoice: adoption?.action ?? 'pending', humanDecision: adoption,
    direction: intent.interpretation, humanEvents: intent.humanEventIds.map((id) => artifact(state, 'human-event', id)),
    actualBehavior: report.input,
    decisions: request.decisionRefs.map((item) => ({ proposal: artifact(state, 'decision-proposal', item.proposalId),
      resolution: item.resolutionId ? artifact(state, 'decision-resolution', item.resolutionId) : null })),
    observations: observationSummary(state, packet.basis.observationId),
    assessment: { id: assessment.id, origin: assessment.origin, ...assessment.input },
    openFindings: artifacts(state, 'assessment').flatMap((source) => source.input.kind === 'assessment'
      ? source.input.findings.filter((finding) => packet.attention.some((item) => item.code === 'open-finding'
        && item.sourceId === source.id + ':' + finding.key)).map((finding) => ({
          reference: { assessmentId: source.id, key: finding.key }, finding,
        })) : []),
    responses: packet.input.responses, attention: packet.attention, concernFindings: packet.input.concernFindings,
    pendingDecisions: packet.pendingDecisions,
    inspection: { taskId: task.taskId, requestId: packet.requestId },
  };
}
