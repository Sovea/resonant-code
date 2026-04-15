import type { CompileTaskInput } from '../types.ts';
import type { ParsedTaskCandidate } from './types.ts';

export interface TaskInterpretationProvider {
  readonly source: 'deterministic' | 'assistive-ai';
  interpret(task: CompileTaskInput): ParsedTaskCandidate;
}
