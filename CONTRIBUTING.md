# Contributing

Read [AGENTS.md](AGENTS.md) for the project goal and core design. Use Node.js 22
and pnpm 10.33.0:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm audit --audit-level high
```

[Core](packages/core/README.md) owns the deterministic task domain and schemas;
[CLI](packages/cli/README.md) owns IO and Host integration. Command schemas are
available through `--input-schema --json`.

Keep `dist/` generated and untracked. Cover changed behavior and recovery paths;
package changes require isolated Core and paired Core/CLI archive verification.

## Local installation

After installing workspace dependencies, pack and install both packages together:

```sh
STETRA_INSTALL_DIR="$HOME/.local/share/stetra"
mkdir -p "$STETRA_INSTALL_DIR/archives"
corepack pnpm -C packages/core pack --pack-destination "$STETRA_INSTALL_DIR/archives"
corepack pnpm -C packages/cli pack --pack-destination "$STETRA_INSTALL_DIR/archives"
npm install --prefix "$STETRA_INSTALL_DIR/runtime" --ignore-scripts \
  "$STETRA_INSTALL_DIR/archives/sovea-stetra-core-0.0.1.tgz" \
  "$STETRA_INSTALL_DIR/archives/sovea-stetra-0.0.1.tgz"
export PATH="$STETRA_INSTALL_DIR/runtime/node_modules/.bin:$PATH"
```

Keep that bin directory in the PATH used to launch Codex.

## Publishing

Configure the GitHub `npm` environment and both packages' npm trusted publishers
for this repository's `publish.yml` workflow and that environment. Publish a
GitHub Release from a version tag on `main` to run the
[publish workflow](.github/workflows/publish.yml).

Core, CLI, and `PRODUCT_VERSION` share the committed stable version. Stable tags
match it; prerelease tags add a suffix, applied only in the publishing runner.
The workflow verifies both archives and publishes Core before CLI. Release
validation and recovery behavior are defined by the workflow and `scripts/`.
