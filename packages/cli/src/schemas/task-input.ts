/** Authoring discovery and generated examples use the actual Core validators. */
import { schemas } from '@sovea/stetra-core';
import { z } from 'zod';

export type InputKind = keyof typeof schemas.commands;
const interpretation = { desiredOutcome: 'Describe the requested observable outcome.', constraints: [], nonGoals: [] };
const report = { behavior: 'Explain the actual changed behavior.', mechanism: ['Explain how the implementation produces it.'] };
const existingAuthority = { kind: 'existing-authority' as const, basis: ['request'], rationale: 'Explain why existing direction permits this choice.' };
export const inputCommandNames: Record<InputKind, string> = {
  begin: 'task begin', amend: 'task amend', propose: 'decision propose', resolve: 'decision resolve',
  'verification-revise': 'verification revise', collect: 'task collect', report: 'task report',
  assess: 'assessment submit', prepare: 'adoption prepare', decide: 'adoption decide',
};
export const inputCommandDescriptions: Record<InputKind, string> = {
  begin: 'Admit exact direction and capture the full dirty Git baseline',
  amend: 'Preserve a Human correction or an Agent interpretation revision; invalidate prior semantic delivery',
  propose: 'Record a concrete engineering choice under existing authority or request new Human authority',
  resolve: 'Bind a resolution to the exact proposal and its actual authority',
  'verification-revise': 'Freeze an explicitly selected verification plan; preserve earlier checks',
  collect: 'Observe current changes and execute frozen argv checks; unchanged collected facts are reused',
  report: 'Explain the current result and freeze its analysis inputs; requires current collected facts',
  assess: 'Record the exact Host Analyzer result for its request; never substitute the implementer judgment',
  prepare: 'Prepare a recommendation after reconciliation; repair within existing authority before presenting avoidable defects',
  decide: 'Record an exact later Human response to the presented Package; acceptance requires current facts and acknowledged limitations',
};
export const taskInputExamples = {
  begin: { humanEvent: { content: 'The exact admitted developer request.' }, interpretation,
    verification: { mode: 'checks', checks: [{ key: 'test', argv: ['npm', 'test'] }] } },
  amend: { kind: 'human-correction', humanEvent: { content: 'The exact developer correction.' }, interpretation },
  propose: { key: 'storage', question: 'Describe the concrete engineering fork.', requiresHuman: false,
    options: [{ key: 'local', description: 'Local persistence.', consequences: ['Available on this machine.'] },
      { key: 'shared', description: 'Shared persistence.', consequences: ['Requires a shared service.'] }],
    selection: { option: 'local', authority: existingAuthority } },
  resolve: { decisionKey: 'storage', proposalId: 'runtime-proposal-id', option: 'local',
    authority: { kind: 'human', humanEvent: { content: 'The exact Human choice of the presented option.' } } },
  'verification-revise': { verification: { mode: 'checks', checks: [{ key: 'test', argv: ['npm', 'test'] }] }, authority: existingAuthority },
  collect: {}, report: { report },
  assess: { kind: 'assessment', requestId: 'runtime-request-id', context: 'separate-context',
    summary: 'Explain the assessed implementation.', claims: [{ key: 'behavior', before: 'Prior behavior.', after: 'Current behavior.',
      mechanism: 'Explain the concrete mechanism.', evidence: [{ kind: 'source', snapshot: 'current', path: 'src/main.ts' }] }],
    relations: [{ claimKey: 'behavior', basis: { kind: 'request' }, explanation: 'Explain the relation to the developer direction.' }], findings: [] },
  prepare: { recommendation: { action: 'accept-with-limitations', rationale: 'Explain the final advice and any disclosed limitations.' } },
  decide: { packageId: 'runtime-package-id', humanEvent: { content: 'The exact later Human adoption response.' },
    action: 'accepted', reason: 'Explain the decision expressed by that message.', acknowledge: [] },
} satisfies { [K in InputKind]: z.input<(typeof schemas.commands)[K]> };

export function taskInputExample(kind: InputKind): string {
  schemas.commands[kind].parse(taskInputExamples[kind]);
  return JSON.stringify(taskInputExamples[kind], null, 2);
}
export function describeTaskInput(kind: InputKind) {
  return { status: 'input-schema', command: inputCommandNames[kind],
    description: inputCommandDescriptions[kind],
    inputSchema: z.toJSONSchema(schemas.commands[kind], { io: 'input' }),
    example: JSON.parse(taskInputExample(kind)) as unknown,
    guidance: [
      'Examples illustrate structure. Use the actual request, repository-specific checks, and current Runtime references.',
      'Runtime additionally validates reference identity, current bindings, ordering, and evidence constraints.',
      'Relayed Human text is exact but unattested. Adoption needs a later Human response to the presented Package.',
      'Use stdin or a file outside the observed project. Never author canonical task artifacts.',
    ] };
}
