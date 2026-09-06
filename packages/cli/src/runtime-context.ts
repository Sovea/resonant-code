import type { Readable, Writable } from 'node:stream';
import { hostAdapterDefinition, type HostAdapter } from './adapters/definition.ts';

export interface PromptProvider {
  selectAdapters(input: {
    choices: readonly HostAdapter[];
    defaults: readonly HostAdapter[];
    installed: readonly HostAdapter[];
    streams: PromptStreams;
  }): Promise<HostAdapter[]>;
}

export interface PromptStreams {
  input: Readable;
  output: Writable;
}

export interface RunCliOptions {
  input?: Readable;
  output?: Writable;
  errorOutput?: Writable;
  interactive?: boolean;
  color?: boolean;
  prompts?: PromptProvider;
}

export interface HostEnvironmentDisclosure {
  surface: 'embedded-skill-and-hooks';
  taskAdmission: 'project-policy';
  verificationExecution: {
    authoritativeCollector: 'stetra-runtime';
    trigger: 'task-collect';
    processModel: 'frozen-argv-without-shell';
    directHostExecution: 'agent-evidence-only';
  };
}

export function hostEnvironmentDisclosure(): HostEnvironmentDisclosure {
  return {
    surface: 'embedded-skill-and-hooks',
    taskAdmission: 'project-policy',
    verificationExecution: {
      authoritativeCollector: 'stetra-runtime',
      trigger: 'task-collect',
      processModel: 'frozen-argv-without-shell',
      directHostExecution: 'agent-evidence-only',
    },
  };
}

export interface CliRuntimeContext {
  input: Readable;
  output: Writable;
  errorOutput: Writable;
  interactive: boolean;
  color: boolean;
  prompts: PromptProvider;
}

export async function resolveRuntimeContext(
  options: RunCliOptions = {},
): Promise<CliRuntimeContext> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const inputIsTty = Boolean((input as Readable & { isTTY?: boolean }).isTTY);
  const outputIsTty = Boolean((output as Writable & { isTTY?: boolean }).isTTY);
  return {
    input,
    output,
    errorOutput: options.errorOutput ?? process.stderr,
    interactive: options.interactive ?? (
      inputIsTty
      && outputIsTty
      && process.env.CI === undefined
    ),
    color: options.color ?? (
      outputIsTty
      && process.env.NO_COLOR === undefined
    ),
    prompts: options.prompts ?? defaultPromptProvider,
  };
}

const defaultPromptProvider: PromptProvider = {
  async selectAdapters({ choices, defaults, installed, streams }) {
    const { checkbox } = await import('@inquirer/prompts');
    return checkbox<HostAdapter>({
      message: 'Select coding agents to set up',
      required: true,
      choices: choices.map((adapter) => ({
        value: adapter,
        name: hostAdapterDefinition(adapter).displayName,
        checked: installed.includes(adapter) || defaults.includes(adapter),
        disabled: installed.includes(adapter) ? '(already enabled)' : false,
      })),
    }, streams);
  },
};
