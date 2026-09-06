import type { evaluateAdoption } from '@sovea/stetra-core';
import { inputCommandDescriptions, inputCommandNames, type InputKind } from '../schemas/task-input.ts';

type View = ReturnType<typeof evaluateAdoption>;

/** Related entry points, not preapproval or a semantic repair/acceptance decision. */
export function relatedOperations(taskId: string, view: View, requestId?: string) {
  const author = (kind: InputKind) => ({
    argv: ['stetra', ...inputCommandNames[kind].split(' '), '.', '--task', taskId, '--json'],
    description: inputCommandDescriptions[kind],
    ...(kind !== 'collect' ? { inputSchema: ['stetra', ...inputCommandNames[kind].split(' '), '--input-schema', '--json'] } : {}),
  });
  const inspect = (section: string, live = false) => ({
    argv: ['stetra', 'task', 'inspect', '.', '--task', taskId, '--section', section,
      ...(['analysis', 'assessment'].includes(section) && requestId ? ['--request', requestId] : []),
      ...(live ? ['--live'] : []), '--json'],
    description: live ? 'Re-observe currency before presenting or adopting this result' : 'Read the selected retained task evidence',
  });
  switch (view.next) {
    case 'complete': return [inspect('history')];
    case 'resolve-decision': return [inspect('decisions'), author('resolve'), author('collect')];
    case 'implement': case 'collect': return [inspect('intent'), author('collect')];
    case 'report': return [author('collect'), author('report')];
    case 'assess': return [inspect('analysis'), author('assess')];
    case 'prepare': return [inspect('assessment'), author('collect'), author('report'), author('prepare')];
    case 'await-human-decision': return [inspect('adoption', true), author('decide')];
  }
}
