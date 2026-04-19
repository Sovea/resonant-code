# Installing Resonant Code for Codex

Use this document as an execution runbook for Codex.
When a user asks Codex to install, update, or uninstall this plugin, Codex should perform the file changes itself instead of asking the user to manually follow shell steps, unless permissions prevent it.

`resonant-code` installs as a local Codex plugin with a marketplace entry.
This repository already contains the plugin manifest at `.codex-plugin/plugin.json`.

## What Codex should do first

1. Treat the repository that contains this file as the source plugin checkout.
2. Confirm that the source plugin root contains:
   - `.codex-plugin/plugin.json`
   - `skills/`
   - `playbook/`
   - `runtime/dist/`
   - `rccl/dist/`
3. Treat the published plugin contents as already built. Do not run `pnpm build` during install or update.
4. If `runtime/dist/` or `rccl/dist/` is missing, stop and tell the user the plugin source is incomplete and should be replaced with a published, already-built plugin checkout.
5. If the user did not specify the install scope, ask whether they want:
   - a repository-level install, or
   - a user-level install
6. Do not overwrite unrelated marketplace entries. Only add, replace, or remove the `resonant-code` entry.

## Install scopes

### Repository-level install

Use this when the plugin should only be available in one repository.

- Plugin directory: `<target-repo>/plugins/resonant-code`
- Marketplace file: `<target-repo>/.agents/plugins/marketplace.json`
- Marketplace source path: `./plugins/resonant-code`

If the target repository is not obvious from context, ask the user for the target repo path.
If the current working directory is the target repo, use it.

### User-level install

Use this when the plugin should be available across repositories for the current user.

- Plugin directory: `~/.codex/plugins/resonant-code`
- Marketplace file: `~/.agents/plugins/marketplace.json`
- Marketplace source path: `./.codex/plugins/resonant-code`

## Marketplace entry shape

Codex marketplace entries should follow the current plugin marketplace format.
Always include `policy.installation`, `policy.authentication`, and `category`.
Omit `policy.products` unless the user explicitly asks for product gating.

Use this plugin entry for `resonant-code`:

```json
{
  "name": "resonant-code",
  "source": {
    "source": "local",
    "path": "REPLACE_WITH_SCOPE_PATH"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

If the marketplace file does not exist yet, create it with this top-level shape and then append the plugin entry:

```json
{
  "name": "local-marketplace",
  "interface": {
    "displayName": "Local Plugins"
  },
  "plugins": []
}
```

## How Codex should install

### Repository-level install flow

When the user asks Codex to install `resonant-code` for one repository, Codex should:

1. Determine the target repository root.
2. Copy or sync the source plugin checkout into `<target-repo>/plugins/resonant-code`.
3. Create or update `<target-repo>/.agents/plugins/marketplace.json`.
4. Ensure the `plugins` array contains exactly one `resonant-code` entry pointing to `./plugins/resonant-code`.
5. Preserve other marketplace entries and their order.
6. Tell the user to restart Codex so the marketplace refreshes.

### User-level install flow

When the user asks Codex to install `resonant-code` for the current user, Codex should:

1. Copy or sync the source plugin checkout into `~/.codex/plugins/resonant-code`.
2. Create or update `~/.agents/plugins/marketplace.json`.
3. Ensure the `plugins` array contains exactly one `resonant-code` entry pointing to `./.codex/plugins/resonant-code`.
4. Preserve other marketplace entries and their order.
5. Tell the user to restart Codex so the marketplace refreshes.

## How Codex should update

When the user asks Codex to update the plugin, Codex should:

1. Determine whether the user wants the repository-level install, the user-level install, or both updated.
2. Sync the source checkout into each installed plugin directory.
3. Re-open the matching marketplace file and verify that the `resonant-code` entry still exists with:
   - `source.source: "local"`
   - the correct scope-specific `source.path`
   - `policy.installation: "AVAILABLE"`
   - `policy.authentication: "ON_INSTALL"`
   - `category: "Productivity"`
4. Keep unrelated marketplace entries unchanged.
5. Tell the user to restart Codex after the update.

If the installed plugin directory is missing but the user asked to update it, treat that scope as a fresh install.

## How Codex should uninstall

When the user asks Codex to uninstall the plugin, Codex should:

1. Determine whether to remove the repository-level install, the user-level install, or both.
2. Remove only the `resonant-code` entry from the matching marketplace file.
3. Delete the matching installed plugin directory:
   - repository-level: `<target-repo>/plugins/resonant-code`
   - user-level: `~/.codex/plugins/resonant-code`
4. Leave unrelated marketplace entries untouched.
5. Tell the user to restart Codex after the uninstall.

If the marketplace file becomes empty after removal, it is fine to keep the file unless the user explicitly asks for cleanup.

## Verification after install or update

Before telling the user the file work is done, Codex should verify that the installed plugin directory contains:

- `.codex-plugin/plugin.json`
- `skills/`
- `playbook/`
- `runtime/dist/`
- `rccl/dist/`

After the user restarts Codex, ask them to confirm that the plugin appears and that at least one skill is available, for example:

- `/resonant-code:init`
- `/resonant-code:calibrate-repo-context`
- `/resonant-code:code <task>`

## Notes for Codex

- Prefer editing JSON files directly instead of asking the user to paste JSON by hand.
- If a `marketplace.json` file already exists, merge the `resonant-code` entry into it instead of replacing the whole file.
- If Codex does not have permission to edit the target files, explain exactly what file needs approval and continue once permission is granted.
- Do not invent extra plugin policy fields beyond the current Codex plugin format.
- Keep the marketplace entry name aligned with `.codex-plugin/plugin.json` `name`.
