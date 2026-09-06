import { PROTOCOL, SCHEMA_VERSION, requireCondition } from '../protocol.ts';
import { unique } from '../intent/compile.ts';
import { ArtifactSchema, EventSchema, ProjectionSchema, type TaskArtifact, type TaskEvent, type TaskState } from './schema.ts';
import { assessmentIsCurrent } from './state.ts';

export function reduceTaskEvent(prior: TaskState | null, eventInput: TaskEvent, artifactInputs: TaskArtifact[]): TaskState {
  const event = EventSchema.parse(eventInput);
  const artifacts = artifactInputs.map((value) => ArtifactSchema.parse(value));
  const allowed: Record<TaskEvent['type'], TaskArtifact['kind'][]> = {
    begin: ['human-event', 'intent', 'verification-plan', 'baseline'],
    amend: ['human-event', 'intent'], propose: ['decision-proposal', 'decision-resolution'],
    resolve: ['human-event', 'decision-resolution'], 'verification-revise': ['human-event', 'verification-plan'],
    collect: ['observation'], report: ['report', 'analysis-request'], assess: ['assessment'],
    prepare: ['adoption-package'], decide: ['human-event', 'adoption-decision', 'intent'],
  };
  requireCondition(artifacts.every((item) => allowed[event.type].includes(item.kind)),
    'EVENT_INVALID', 'Event contains an unrelated artifact kind.');
  requireCondition(event.sequence === (prior?.revision ?? 0) + 1
    && (!prior || event.taskId === prior.taskId), 'EVENT_ORDER_INVALID', 'Task event ordering or identity is invalid.');
  unique(event.artifactIds, 'event artifact references');
  unique(artifacts.map((item) => item.id), 'event artifacts');
  requireCondition(event.artifactIds.length === artifacts.length && artifacts.every((item) =>
    item.taskId === event.taskId && event.artifactIds.includes(item.id) && !prior?.records.some((r) => r.id === item.id)),
  'ARTIFACT_INVALID', 'Event must publish exactly its referenced new task artifacts.');
  const one = <K extends TaskArtifact['kind']>(kind: K) => {
    const matches = artifacts.filter((item): item is Extract<TaskArtifact, { kind: K }> => item.kind === kind);
    requireCondition(matches.length === 1, 'EVENT_INVALID', `${event.type} requires exactly one ${kind}.`);
    return matches[0];
  };
  let state: TaskState;
  if (event.type === 'begin') {
    requireCondition(!prior, 'TASK_EXISTS', 'Task has already begun.');
    const plan = one('verification-plan');
    state = { protocol: PROTOCOL, schemaVersion: SCHEMA_VERSION, taskId: event.taskId, revision: event.sequence,
      attemptNumber: 1, closed: false, intentId: one('intent').id, baselineId: one('baseline').id,
      planId: plan.id, executionPolicy: plan.executionPolicy, records: artifacts };
    one('human-event');
  } else {
    requireCondition(prior && !prior.closed, 'TASK_CLOSED', 'Only an active task can advance.');
    state = { ...prior, revision: event.sequence, records: [...prior.records, ...artifacts] };
    switch (event.type) {
      case 'amend': state.intentId = one('intent').id; break;
      case 'propose': one('decision-proposal'); break;
      case 'resolve': one('decision-resolution'); break;
      case 'verification-revise': state.planId = one('verification-plan').id; break;
      case 'collect': state.observationId = one('observation').id; break;
      case 'report': {
        const report = artifacts.find((item) => item.kind === 'report');
        if (report) state.reportId = report.id;
        state.requestId = one('analysis-request').id;
        state.assessmentId = undefined;
        break;
      }
      case 'assess': {
        const assessment = one('assessment');
        requireCondition(assessment.currentAtSubmission === assessmentIsCurrent(state, assessment),
          'ASSESSMENT_BINDING_INVALID', 'Stored assessment applicability does not match its submission basis.');
        if (assessmentIsCurrent(state, assessment)) state.assessmentId = assessment.id;
        break;
      }
      case 'prepare': state.packageId = one('adoption-package').id; break;
      case 'decide': {
        const adoption = one('adoption-decision');
        state.adoptionId = adoption.id;
        if (adoption.action === 'correction-requested') {
          state.intentId = one('intent').id;
          state.attemptNumber += 1;
        } else if (adoption.action !== 'deferred') state.closed = true;
        break;
      }
    }
  }
  const { records, ...projection } = state;
  return { ...ProjectionSchema.parse(projection), records };
}
