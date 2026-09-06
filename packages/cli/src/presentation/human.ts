import type { Colors } from 'picocolors/types';
import { formatInit, formatReadiness } from './human/setup.ts';
import { heading, isRecord, statusLine } from './human/shared.ts';

export function formatHumanResult(command: string, output: unknown, colors: Colors): string {
  if (!isRecord(output)) return String(output);
  if (output.status === 'input-schema') return JSON.stringify(output, null, 2);
  if (command === 'init') return formatInit(output, colors);
  if (command === 'status') return formatReadiness(output, colors);
  const lines = [heading('Stetra managed change', colors), statusLine(String(output.status ?? 'ok'), colors)];
  if (isRecord(output.adoptionBrief)) appendAdoption(lines, output.adoptionBrief, colors);
  else {
    if (typeof output.taskId === 'string') lines.push(`Task: ${output.taskId}`);
    if (typeof output.phase === 'string') lines.push(`Phase: ${output.phase}; facts: ${String(output.factsCurrency)}`);
    if (isRecord(output.summary)) {
      lines.push(`Outcome: ${String(output.summary.intendedOutcome)}`);
      if (isRecord(output.summary.observations)) appendObservations(lines, output.summary.observations);
    }
  }
  // Explicit inspection must expose its selected detail in text mode as well as JSON.
  for (const [key, value] of Object.entries(output)) {
    if (['intent', 'humanEvents', 'decisions', 'baseline', 'verification', 'observations', 'observation', 'report',
      'analysis', 'analysisDocument', 'assessments', 'events', 'records', 'patch', 'check', 'definition', 'selectedAttempt', 'log'].includes(key)) {
      lines.push('', colors.bold(key), JSON.stringify(value, null, 2));
    }
  }
  if (typeof output.content === 'string') lines.push(`Source (${String(output.encoding)}, ${String(output.returnedBytes)}/${String(output.totalBytes)} bytes):`, output.content);
  if (isRecord(output.directive)) lines.push('', `Next: ${String(output.directive.kind)}. ${String(output.directive.message)}`);
  return lines.join('\n');
}

function appendAdoption(lines: string[], brief: Record<string, unknown>, colors: Colors): void {
  if (isRecord(brief.recommendation)) {
    lines.push(`${colors.bold('Agent recommendation:')} ${String(brief.recommendation.action)}`, String(brief.recommendation.rationale));
    strings(lines, brief.recommendation.caveats, 'Caveat');
  }
  lines.push(`Human adoption: ${String(brief.humanChoice)}`, `Package: ${String(brief.packageId)}`,
    `Current: ${String(brief.current)}; fact currency: ${String(brief.factsCurrency)}`);
  if (isRecord(brief.direction)) lines.push(`Intended outcome: ${String(brief.direction.desiredOutcome)}`);
  if (isRecord(brief.actualBehavior)) {
    lines.push('', colors.bold('Implementer explanation'), String(brief.actualBehavior.behavior));
    dimensions(lines, brief.actualBehavior);
  }
  if (Array.isArray(brief.decisions)) for (const decision of brief.decisions) {
    if (!isRecord(decision) || !isRecord(decision.proposal) || !isRecord(decision.proposal.input)) continue;
    const proposal = decision.proposal.input;
    lines.push(`Decision: ${String(proposal.question)}`);
    if (isRecord(decision.resolution)) {
      const resolution = decision.resolution;
      lines.push(`Selected: ${String(resolution.option)}; authority: ${String(resolution.actor)}`, String(resolution.rationale));
      if (Array.isArray(proposal.options)) for (const option of proposal.options) {
        if (!isRecord(option)) continue;
        lines.push(`${option.key === resolution.option ? 'Chosen option' : 'Alternative'}: ${String(option.description)}`);
        strings(lines, option.consequences, 'Consequence');
      }
    }
    else lines.push('Resolution pending.', JSON.stringify(proposal.options));
  }
  if (isRecord(brief.observations)) {
    lines.push('', colors.bold('Runtime observations')); appendObservations(lines, brief.observations);
  }
  if (isRecord(brief.assessment)) {
    const assessment = brief.assessment;
    lines.push('', colors.bold('Analyzer judgment'));
    if (isRecord(assessment.origin)) lines.push(`Provenance: ${String(assessment.origin.transport)}${assessment.origin.host ? ` (${String(assessment.origin.host)})` : ''}`);
    if (assessment.kind === 'unavailable') lines.push(`Analysis unavailable: ${String(assessment.reason)}`);
    else {
      lines.push(String(assessment.summary), `Context: ${String(assessment.context)}`);
      if (Array.isArray(assessment.dispositions)) for (const disposition of assessment.dispositions) {
        if (isRecord(disposition)) lines.push(`Finding disposition: ${String(disposition.outcome)} — ${String(disposition.rationale)}`, `Source: ${JSON.stringify(disposition.finding)}`);
      }
      strings(lines, assessment.reviewFocus, 'Review focus');
    }
  }
  if (Array.isArray(brief.responses)) for (const response of brief.responses) {
    if (isRecord(response)) lines.push(`Implementer response: ${String(response.response)}`, `Finding: ${JSON.stringify(response.finding)}`);
  }
  const renderedFindings = new Map<string, string>();
  if (Array.isArray(brief.openFindings)) for (const item of brief.openFindings) {
    if (isRecord(item) && isRecord(item.reference)) {
      renderedFindings.set(`${String(item.reference.assessmentId)}:${String(item.reference.key)}`, String(item.reference.key));
      lines.push(`Unresolved finding: ${String(item.reference.key)}`); appendFinding(lines, item.finding);
    }
  }
  if (Array.isArray(brief.attention) && brief.attention.length) {
    lines.push('', colors.bold('Attention requiring explicit acknowledgment for acceptance'));
    for (const [index, item] of brief.attention.entries()) if (isRecord(item)) {
      const finding = item.code === 'open-finding' ? renderedFindings.get(String(item.sourceId)) : undefined;
      lines.push(`A${index + 1} (${String(item.code)}): ${finding ? `Unresolved finding ${finding}, expanded above.` : String(item.message)}`, `Attention ID: ${String(item.id)}`);
    }
  }
  if (Array.isArray(brief.concernFindings)) for (const finding of brief.concernFindings) lines.push(`Concern judgment: ${JSON.stringify(finding)}`);
  if (brief.humanChoice === 'pending') lines.push('', 'Human choice: accept, request correction, reject, or defer.');
  if (isRecord(brief.inspection)) lines.push(`Full claims, source references, and provenance: stetra task inspect . --task ${String(brief.inspection.taskId)} --section assessment --request ${String(brief.inspection.requestId)} --json`);
}
function appendObservations(lines: string[], observation: Record<string, unknown>): void {
  if (Array.isArray(observation.changedFiles)) lines.push(`Changed files: ${observation.changedFiles.length}; paths and operations are available in observation inspection.`);
  if (Array.isArray(observation.checks)) for (const check of observation.checks) {
    if (isRecord(check)) lines.push(`Check ${String(check.key)}: ${String(check.status)} (attempt ${String(check.attempt)}, ${isRecord(check.termination) ? String(check.termination.kind) : 'unknown termination'})`);
  }
  if (isRecord(observation.verification) && observation.verification.mode === 'no-command') lines.push(`No command: ${String(observation.verification.rationale)}`);
  if (isRecord(observation.refresh)) lines.push(`Refresh reason (Agent judgment): ${String(observation.refresh.reason)}`);
}
function dimensions(lines: string[], item: Record<string, unknown>): void {
  for (const key of ['mechanism', 'ownership', 'invariants', 'failureAndRecovery', 'effects', 'tradeoffs']) strings(lines, item[key], key);
}
function strings(lines: string[], value: unknown, label: string): void {
  if (typeof value === 'string') lines.push(`${label}: ${value}`);
  if (Array.isArray(value)) for (const entry of value) lines.push(`${label}: ${typeof entry === 'string' ? entry : JSON.stringify(entry)}`);
}
function appendFinding(lines: string[], finding: unknown): void {
  if (!isRecord(finding)) return;
  lines.push(`Finding (${String(finding.kind)}): ${String(finding.statement)}`, `Consequence: ${String(finding.consequence)}`);
  if (finding.nextAction) lines.push(`Review: ${String(finding.nextAction)}`);
}
