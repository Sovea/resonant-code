import { Command } from 'commander';
import { z } from 'zod';

import { DEFAULT_HOST_ADAPTER, HOST_ADAPTERS } from '../adapters/definition.ts';
import {
  initializeProject,
  inspectProjectInstallation,
} from '../project/init.ts';
import { HostAdapterSchema } from '../schemas/project.ts';
import { parseArtifact } from '../validation.ts';
import type { CommandEnvironment } from './shared.ts';
import { collectOption } from './shared.ts';

const AdapterListSchema = z.array(HostAdapterSchema);

interface InitOptions {
  adapter: string[];
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
}

export function registerInitCommand(
  program: Command,
  environment: CommandEnvironment,
): void {
  program
    .command('init')
    .description('Install project-local host adapters managed by the CLI')
    .argument('[project-root]', 'project root', '.')
    .option(
      '-a, --adapter <host>',
      `coding agent to set up (repeatable: ${HOST_ADAPTERS.join(' or ')})`,
      collectOption,
      [],
    )
    .option('--dry-run', 'plan managed artifact changes without writing')
    .option('--force', 'replace modified managed artifacts explicitly')
    .option('-y, --yes', 'skip selection; keep existing adapters or default to Codex')
    .action(async (
      projectRoot: string,
      options: InitOptions,
      command: Command,
    ) => {
      let adapters = parseArtifact(AdapterListSchema, options.adapter, 'init adapters');
      if (
        !adapters.length
        && !options.yes
        && environment.shouldPrompt(command)
      ) {
        const installed = inspectProjectInstallation(projectRoot).adapters;
        if (HOST_ADAPTERS.some((adapter) => !installed.includes(adapter))) {
          adapters = parseArtifact(AdapterListSchema.nonempty(),
            await environment.runtime.prompts.selectAdapters({
              choices: HOST_ADAPTERS,
              defaults: installed.length ? installed : [DEFAULT_HOST_ADAPTER],
              installed,
              streams: {
                input: environment.runtime.input,
                output: environment.runtime.output,
              },
            }), 'init adapters');
        }
      }
      const output = initializeProject({
        projectRoot,
        adapters,
        force: Boolean(options.force),
        dryRun: Boolean(options.dryRun),
      });
      environment.emit('init', output, command);
    });
}
