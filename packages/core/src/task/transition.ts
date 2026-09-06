import { z } from 'zod';
import { DomainError, PROTOCOL, SCHEMA_VERSION, fingerprint, requireCondition } from '../protocol.ts';
import { Authority, Id } from '../schemas/primitives.ts';
import { compileVerification, unique } from '../intent/compile.ts';
import { ExecutionPolicySchema, VerificationInputSchema, type HumanEvent, type Intent, type VerificationPlan } from '../intent/schema.ts';
import { ObservationDataSchema, WorktreeSnapshotSchema, type Observation } from '../observations/schema.ts';
import { validateObservation, validateSnapshot } from '../observations/validate.ts';
import { AnalysisOriginSchema, type ImplementationReport } from '../assessments/schema.ts';
import { bindAssessment, bindEvidence, bindResponses } from '../assessments/evidence.ts';
import { evaluateAdoption, type Currency } from '../adoption/evaluate.ts';
import { ArtifactSchema, commandSchemas, type TaskArtifact, type TaskCommand, type TaskState } from './schema.ts';
import { currentBasis, decisionDigest, decisions, findingDigest, openFindings, record, records } from './state.ts';
import { reduceTaskEvent } from './reduce.ts';

export const RuntimeInputsSchema = z.strictObject({
  taskId: z.uuid(), operationId: z.uuid(),
  baseline: WorktreeSnapshotSchema.optional(), observation: ObservationDataSchema.optional(),
  executionPolicy: ExecutionPolicySchema.optional(), verification: VerificationInputSchema.optional(),
  currency: z.strictObject({ worktreeFingerprint: Id, executionInputsFingerprint: Id }).optional(),
  analysisOrigin: AnalysisOriginSchema.optional(),
});
export type RuntimeInputs = z.infer<typeof RuntimeInputsSchema>;
export type TransitionResult = ReturnType<typeof planTransition>;

export function planTransition(state: TaskState | null, command: TaskCommand, runtimeInput: RuntimeInputs) {
  try {
    const runtime = RuntimeInputsSchema.parse(runtimeInput);
    const artifacts = authorTransition(state, command, runtime).map((value) => ArtifactSchema.parse(value));
    if (!artifacts.length) {
      requireCondition(state, 'TASK_REQUIRED', 'A task is required.');
      return { status: 'unchanged' as const, state };
    }
    const event = { protocol: PROTOCOL, schemaVersion: SCHEMA_VERSION,
      id: `${runtime.operationId}:event`, taskId: runtime.taskId, sequence: (state?.revision ?? 0) + 1,
      type: command.type, artifactIds: artifacts.map((item) => item.id) };
    return { status: 'transition' as const, event, artifacts, state: reduceTaskEvent(state, event, artifacts) };
  } catch (error) {
    if (error instanceof DomainError) return { status: 'invalid' as const, issues: [{ code: error.code, path: '', message: error.message }] };
    if (error instanceof z.ZodError) return { status: 'invalid' as const, issues: error.issues.map((issue) => ({
      code: 'INPUT_INVALID', path: issue.path.join('.'), message: issue.message,
    })) };
    throw error;
  }
}

function authorTransition(state: TaskState | null, command: TaskCommand, runtime: RuntimeInputs): TaskArtifact[] {
  const header = (kind: TaskArtifact['kind']) => ({ id: `${runtime.operationId}:${kind}`, taskId: runtime.taskId });
  const human = (purpose: HumanEvent['purpose'], content: string): HumanEvent => ({
    ...header('human-event'), kind: 'human-event', purpose, content, provenance: 'unattested-input',
  });
  if (command.type === 'begin') {
    requireCondition(!state, 'TASK_EXISTS', 'This task has already begun.');
    const input = commandSchemas.begin.parse(command.input);
    requireCondition(runtime.baseline && runtime.verification && runtime.executionPolicy,
      'RUNTIME_INPUT_REQUIRED', 'Begin requires a captured baseline, resolved verification, and execution policy.');
    validateSnapshot(runtime.baseline);
    const request = human('request', input.humanEvent.content);
    const plan = compileVerification(runtime.verification, header('verification-plan'), runtime.executionPolicy,
      [request.id], 'Verification for the admitted request.');
    const intent: Intent = { ...header('intent'), kind: 'intent', humanEventIds: [request.id],
      interpretation: input.interpretation, assurance: input.assurance,
      concernChecks: concernChecks(input.assurance, plan), reason: 'Initial Agent interpretation.' };
    return [request, plan, intent, { ...header('baseline'), kind: 'baseline', snapshot: runtime.baseline }];
  }
  requireCondition(state && !state.closed && state.taskId === runtime.taskId,
    'TASK_CLOSED', 'An active task with the exact identity is required.');
  const intent = record(state, 'intent', state.intentId);
  const plan = record(state, 'verification-plan', state.planId);
  const artifacts: TaskArtifact[] = [];
  const authority = (source: z.infer<typeof Authority>, purpose: HumanEvent['purpose']) => {
    if (source.kind === 'human') {
      const event = human(purpose, source.humanEvent.content);
      artifacts.push(event);
      return { actor: 'human' as const, authorityEventIds: [event.id], rationale: event.content };
    }
    unique(source.basis, 'authority references');
    const ids = source.basis.map((id) => id === 'request' ? intent.humanEventIds[0] : id);
    for (const id of ids) record(state, 'human-event', id);
    return { actor: 'agent' as const, authorityEventIds: ids, rationale: source.rationale };
  };
  switch (command.type) {
    case 'amend': {
      const input = commandSchemas.amend.parse(command.input);
      const revision: Intent = { ...intent, ...header('intent'), previousId: intent.id, interpretation: input.interpretation };
      if (input.kind === 'human-correction') {
        const event = human('correction', input.humanEvent.content);
        artifacts.push(event);
        revision.humanEventIds = [...intent.humanEventIds, event.id];
        revision.reason = 'Agent interpretation of the exact Human correction.';
        if (input.assurance) {
          revision.assurance = input.assurance;
          revision.concernChecks = concernChecks(input.assurance, plan);
        }
      } else {
        if (fingerprint(input.interpretation) === fingerprint(intent.interpretation)) return [];
        revision.reason = input.reason;
      }
      artifacts.push(revision);
      break;
    }
    case 'propose': {
      const input = commandSchemas.propose.parse(command.input);
      unique(input.options.map((option) => option.key), 'decision options');
      const previous = decisions(state).find((item) => item.proposal.input.key === input.key)?.proposal;
      if (previous && previous.intentId === state.intentId && fingerprint(previous.input) === fingerprint(input)) return [];
      for (const option of [input.proposedOption, input.selection?.option].filter(Boolean)) {
        requireCondition(input.options.some((item) => item.key === option), 'OPTION_INVALID', 'Selected/proposed option must exist.');
      }
      requireCondition(!input.requiresHuman || !input.selection, 'HUMAN_RESOLUTION_REQUIRED', 'A proposal requiring new Human authority cannot select itself.');
      const proposal = { ...header('decision-proposal'), kind: 'decision-proposal' as const,
        intentId: state.intentId, ...(previous ? { previousId: previous.id } : {}), input };
      artifacts.push(proposal);
      if (input.selection) artifacts.push({ ...header('decision-resolution'), kind: 'decision-resolution',
        intentId: state.intentId, proposalId: proposal.id, decisionKey: input.key,
        option: input.selection.option, ...authority(input.selection.authority, 'decision') });
      break;
    }
    case 'resolve': {
      const input = commandSchemas.resolve.parse(command.input);
      const entry = decisions(state).find((item) => item.proposal.input.key === input.decisionKey);
      requireCondition(entry?.proposal.id === input.proposalId, 'PROPOSAL_SUPERSEDED', 'Resolution must refer to the exact current proposal.');
      requireCondition(entry.proposal.input.options.some((option) => option.key === input.option), 'OPTION_INVALID', 'Selected option does not exist.');
      const source = authority(input.authority, 'decision');
      if (entry.proposal.input.requiresHuman && source.actor !== 'human') {
        const prior = records(state, 'decision-resolution').find((resolution) => resolution.actor === 'human'
          && resolution.proposalId === input.proposalId && resolution.option === input.option
          && resolution.authorityEventIds.every((id) => source.authorityEventIds.includes(id)));
        requireCondition(prior, 'HUMAN_RESOLUTION_REQUIRED', 'This choice requires Human authority; revalidation must cite its prior exact resolution.');
      }
      if (entry.resolution?.option === input.option && entry.resolution.actor === source.actor
        && fingerprint(entry.resolution.authorityEventIds) === fingerprint(source.authorityEventIds)) return [];
      artifacts.push({ ...header('decision-resolution'), kind: 'decision-resolution', intentId: state.intentId,
        proposalId: input.proposalId, decisionKey: input.decisionKey, option: input.option, ...source });
      break;
    }
    case 'verification-revise': {
      const input = commandSchemas['verification-revise'].parse(command.input);
      requireCondition(runtime.verification, 'VERIFICATION_REQUIRED', 'Resolve the requested verification plan first.');
      const source = authority(input.authority, 'correction');
      const revised = compileVerification(runtime.verification, header('verification-plan'), state.executionPolicy,
        source.authorityEventIds, source.rationale, plan.id);
      if (fingerprint({ mode: revised.mode, definitions: revised.definitions, rationale: revised.rationale })
        === fingerprint({ mode: plan.mode, definitions: plan.definitions, rationale: plan.rationale })) return [];
      artifacts.push(revised);
      break;
    }
    case 'collect': {
      commandSchemas.collect.parse(command.input);
      requireCondition(runtime.observation, 'OBSERVATION_REQUIRED', 'Collect the Runtime facts before publication.');
      const data = runtime.observation;
      validateObservation(data, record(state, 'baseline', state.baselineId).snapshot, plan);
      const previous = state.observationId ? record(state, 'observation', state.observationId) : undefined;
      if (previous && fingerprint(previous.data) === fingerprint(data) && previous.planId === plan.id) return [];
      validateReexecution(state, data, previous);
      artifacts.push({ ...header('observation'), kind: 'observation', planId: plan.id, attemptNumber: state.attemptNumber, data });
      break;
    }
    case 'report': {
      const input = commandSchemas.report.parse(command.input);
      requireCurrentFacts(state, runtime.currency);
      const observationId = state.observationId!;
      unique(input.report.decisions, 'reported decisions');
      for (const key of input.report.decisions) requireCondition(decisions(state).some((item) => item.proposal.input.key === key),
        'DECISION_INVALID', `Report references an absent decision: ${key}.`);
      const bound = { ...input.report, evidence: bindEvidence(state, observationId, input.report.evidence),
        responses: bindResponses(state, observationId, input.report.responses) };
      let report: ImplementationReport = { ...header('report'), kind: 'report', intentId: state.intentId,
        planId: plan.id, observationId, decisionDigest: decisionDigest(state), input: bound };
      const previous = state.reportId ? record(state, 'report', state.reportId) : undefined;
      const same = previous && previous.intentId === report.intentId && previous.planId === report.planId
        && previous.observationId === report.observationId && previous.decisionDigest === report.decisionDigest
        && fingerprint(previous.input) === fingerprint(report.input);
      if (same) {
        if (!input.reassessReason) return [];
        report = previous;
      } else artifacts.push(report);
      artifacts.push({ ...header('analysis-request'), kind: 'analysis-request',
        basis: { intentId: state.intentId, planId: state.planId, observationId, decisionDigest: decisionDigest(state), reportId: report.id },
        decisionRefs: decisions(state).map(({ proposal, resolution }) => ({
          proposalId: proposal.id, ...(resolution ? { resolutionId: resolution.id } : {}),
        })),
        priorFindings: openFindings(state).map((item) => item.reference),
        reason: input.reassessReason ?? 'Assess the current implementation report against the observed result.' });
      break;
    }
    case 'assess': {
      const source = commandSchemas.assess.parse(command.input);
      const request = record(state, 'analysis-request', source.requestId);
      const input = bindAssessment(state, request, source);
      const previous = records(state, 'assessment').find((item) => item.input.requestId === request.id);
      if (previous) {
        requireCondition(fingerprint(previous.input) === fingerprint(input), 'ASSESSMENT_EXISTS', 'A different result requires a new analysis request.');
        return [];
      }
      artifacts.push({ ...header('assessment'), kind: 'assessment', input,
        currentAtSubmission: request.id === state.requestId && Boolean(state.reportId && state.observationId)
          && fingerprint(request.basis) === fingerprint(currentBasis(state)),
        origin: runtime.analysisOrigin ?? { transport: 'agent-relay' } });
      break;
    }
    case 'prepare': {
      const input = commandSchemas.prepare.parse(command.input);
      const view = requireCurrentFacts(state, runtime.currency);
      requireCondition(view.assessmentCurrent, 'ASSESSMENT_REQUIRED', 'Submit a current Assessment or an explicit unavailable result.');
      const responses = bindResponses(state, state.observationId!, input.responses);
      validateConcernConclusions(state, input.concernFindings);
      const attention = [...view.attention];
      if (intent.assurance.mode === 'consequential') for (const concern of intent.assurance.concerns) {
        const finding = input.concernFindings.find((item) => item.concernKey === concern.key);
        if (!finding || finding.status !== 'supported') attention.push({
          id: fingerprint({ concern: concern.key, status: finding?.status ?? 'missing' }),
          code: 'concern-gap', message: `${concern.key}: ${finding?.explanation ?? 'No conclusion supplied.'}`, sourceId: intent.id,
        });
      }
      requireCondition(!attention.length || input.recommendation.action !== 'accept', 'RECOMMENDATION_EXCEEDS_EVIDENCE',
        'Disclose current Attention with accept-with-limitations, or recommend correction, rejection, or deferral.');
      const packet = { ...header('adoption-package'), kind: 'adoption-package' as const, basis: currentBasis(state),
        requestId: state.requestId!, assessmentId: state.assessmentId!, findingDigest: findingDigest(state),
        input: { ...input, responses }, attention, pendingDecisions: view.pendingDecisions };
      const previous = state.packageId ? record(state, 'adoption-package', state.packageId) : undefined;
      if (previous && fingerprint({ ...previous, id: '' }) === fingerprint({ ...packet, id: '' })) return [];
      artifacts.push(packet);
      break;
    }
    case 'decide': {
      const input = commandSchemas.decide.parse(command.input);
      const packet = record(state, 'adoption-package', input.packageId);
      unique(input.acknowledge, 'Attention acknowledgments');
      requireCondition(input.acknowledge.every((id) => packet.attention.some((item) => item.id === id)),
        'ACKNOWLEDGMENT_INVALID', 'Acknowledge only limitations in the presented Package.');
      if (input.action === 'accepted') {
        const view = requireCurrentFacts(state, runtime.currency);
        requireCondition(state.packageId === packet.id && view.acceptanceStructurallyPossible,
          'PACKAGE_STALE', 'Acceptance requires the exact current Package and resolved Human choices.');
        requireCondition(packet.attention.every((item) => input.acknowledge.includes(item.id)),
          'ACKNOWLEDGMENT_REQUIRED', 'Acceptance must acknowledge every disclosed limitation.');
      }
      const event = human('adoption', input.humanEvent.content);
      artifacts.push(event, { ...header('adoption-decision'), kind: 'adoption-decision',
        packageId: packet.id, humanEventId: event.id, action: input.action, reason: input.reason, acknowledge: input.acknowledge });
      if (input.action === 'correction-requested') artifacts.push({ ...intent, ...header('intent'), previousId: intent.id,
        humanEventIds: [...intent.humanEventIds, event.id], interpretation: input.correction!, reason: 'Agent interpretation of the Human correction request.' });
      break;
    }
  }
  return artifacts;
}

function requireCurrentFacts(state: TaskState, currency: Currency | undefined) {
  const view = evaluateAdoption(state, currency);
  requireCondition(view.factsCurrency === 'current', 'FACTS_STALE', 'Collect or verify current worktree and declared input facts first.');
  return view;
}

function concernChecks(assurance: Intent['assurance'], plan: VerificationPlan): Intent['concernChecks'] {
  if (assurance.mode === 'routine') return [];
  unique(assurance.concerns.map((concern) => concern.key), 'concern keys');
  return assurance.concerns.flatMap((concern) => concern.evidenceRequirements.flatMap((requirement) => {
    if (requirement.kind !== 'check') return [];
    const definition = plan.definitions.find((item) => item.key === requirement.checkKey);
    requireCondition(definition, 'CONCERN_EVIDENCE_INVALID', `Concern ${concern.key} names an absent check: ${requirement.checkKey}.`);
    return [{ concernKey: concern.key, checkKey: definition.key, definitionId: definition.definitionId }];
  }));
}

function validateConcernConclusions(state: TaskState, findings: Array<{ concernKey: string; status: string }>) {
  unique(findings.map((item) => item.concernKey), 'concern findings');
  const intent = record(state, 'intent', state.intentId);
  const observation = record(state, 'observation', state.observationId);
  for (const finding of findings) {
    const concern = intent.assurance.mode === 'consequential'
      ? intent.assurance.concerns.find((item) => item.key === finding.concernKey) : undefined;
    requireCondition(concern, 'CONCERN_INVALID', `Undeclared concern: ${finding.concernKey}.`);
    if (finding.status === 'supported') {
      requireCondition(!concern.evidenceRequirements.some((item) => item.kind === 'human-review')
        && intent.concernChecks.filter((item) => item.concernKey === concern.key).every((item) =>
          observation.data.checks.some((check) => check.definitionId === item.definitionId && check.attempts.at(-1)?.status === 'passed')),
      'CONCLUSION_EXCEEDS_EVIDENCE', 'A supported concern needs its exact declared evidence; Agent prose cannot substitute for it.');
    }
  }
}

function validateReexecution(state: TaskState, data: Observation['data'], previous?: Observation) {
  requireCondition(!(data.retry && data.refresh), 'REEXECUTION_INVALID', 'Use timeout retry or failure refresh, not both.');
  if (!data.retry && !data.refresh) return;
  const priorId = data.retry?.priorObservationId ?? data.refresh?.priorObservationId;
  requireCondition(previous && previous.id === priorId && previous.planId === state.planId
    && data.preCheck.fingerprint === previous.data.current.fingerprint
    && fingerprint(data.preCheckExecutionInputs) === fingerprint(previous.data.currentExecutionInputs),
  'REEXECUTION_INVALID', 'Re-execution must refer to unchanged current facts.');
  if (data.refresh) {
    requireCondition(data.checks.every((check) => check.attempts.length === 1
      && check.attempts[0].timeoutMs === previous.data.checks.find((prior) => prior.definitionId === check.definitionId)?.attempts.at(-1)?.timeoutMs),
    'REFRESH_INVALID', 'Refresh reruns every check at its existing budget in a new Observation.');
    requireCondition(previous.data.checks.some((check) => check.attempts.at(-1)?.status !== 'passed'
      && check.attempts.at(-1)?.termination.kind !== 'timeout'), 'REFRESH_INVALID', 'Refresh requires a non-timeout failure.');
    requireCondition(!records(state, 'observation').some((item) => item.attemptNumber === state.attemptNumber
      && item.data.refresh && item.planId === state.planId
      && item.data.preCheck.fingerprint === data.preCheck.fingerprint
      && fingerprint(item.data.preCheckExecutionInputs) === fingerprint(data.preCheckExecutionInputs)),
    'REFRESH_EXHAUSTED', 'This unchanged delivery Attempt already used its failure refresh.');
  }
  if (data.retry) {
    const definition = record(state, 'verification-plan', state.planId).definitions.find((item) => item.key === data.retry!.checkKey);
    const prior = previous.data.checks.find((check) => check.definitionId === definition?.definitionId);
    const next = data.checks.find((check) => check.definitionId === definition?.definitionId);
    requireCondition(data.checks.filter((check) => check.definitionId !== definition?.definitionId).every((check) =>
      fingerprint(check) === fingerprint(previous.data.checks.find((prior) => prior.definitionId === check.definitionId))),
    'RETRY_INVALID', 'A timeout retry must preserve every other Check unchanged.');
    requireCondition(prior && next && prior.attempts.at(-1)?.termination.kind === 'timeout'
      && next.attempts.length === prior.attempts.length + 1
      && fingerprint(next.attempts.slice(0, -1)) === fingerprint(prior.attempts)
      && next.attempts.at(-1)!.timeoutMs > prior.attempts.at(-1)!.timeoutMs
      && next.attempts.at(-1)!.timeoutMs <= state.executionPolicy.maxTimeoutMs
      && next.attempts.length - 1 <= state.executionPolicy.maxTimeoutRetriesPerCheck,
    'RETRY_INVALID', 'Retry requires an actual timeout, a larger bounded budget, and preserved Attempts.');
  }
}
