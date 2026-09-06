import pc from 'picocolors';

import type { CliError } from '../errors.ts';
import { formatHumanResult } from './human.ts';

export interface CliExecution {
  output: unknown;
  json: boolean;
  exitCode: number;
  command: string;
  color: boolean;
}

export function formatCliOutput(execution: CliExecution): string {
  if (execution.json) return `${JSON.stringify(execution.output, null, 2)}\n`;
  if (typeof execution.output === 'string') return `${execution.output}\n`;
  return `${formatHumanResult(
    execution.command,
    execution.output,
    pc.createColors(execution.color),
  )}\n`;
}

export function formatCliError(error: CliError, json: boolean, color: boolean): string {
  if (json) {
    return `${JSON.stringify({
      status: 'error',
      code: error.code,
      message: error.message,
      ...(error.issues?.length ? { issues: error.issues } : {}),
    }, null, 2)}\n`;
  }
  const colors = pc.createColors(color);
  const recovery = error.issues?.filter((issue) => issue.remediation).map((issue) =>
    `${issue.code ?? error.code} (${issue.path}): ${issue.remediation}`) ?? [];
  return [`${colors.red(colors.bold('error'))} [${error.code}]: ${error.message}`, ...recovery].join('\n') + '\n';
}
