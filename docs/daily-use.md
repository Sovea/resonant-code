# Daily use with Codex

Stetra runs inside your usual Codex conversation. You supply the requirement,
intervene when a new choice matters, and review the final result. The Agent
authors the protocol inputs and manages collection, analysis, and repair.

## Install this checkout

For the initial implementation, use the paired archives built from the checkout
you reviewed. Installing a registry version does not establish that it contains
this work. From the Stetra checkout, in a POSIX shell:

```sh
corepack pnpm install --frozen-lockfile
STETRA_INSTALL_DIR="$HOME/.local/share/stetra"
mkdir -p "$STETRA_INSTALL_DIR/archives"
corepack pnpm -C packages/core pack --pack-destination "$STETRA_INSTALL_DIR/archives"
corepack pnpm -C packages/cli pack --pack-destination "$STETRA_INSTALL_DIR/archives"
npm install --prefix "$STETRA_INSTALL_DIR/runtime" --ignore-scripts \
  "$STETRA_INSTALL_DIR/archives/sovea-stetra-core-0.0.1.tgz" \
  "$STETRA_INSTALL_DIR/archives/sovea-stetra-0.0.1.tgz"
export PATH="$STETRA_INSTALL_DIR/runtime/node_modules/.bin:$PATH"
stetra --version
```

Keep that bin directory in the PATH used to launch Codex. Initialize the target
Git repository, then start a new Codex session so it loads the generated files:

```sh
stetra init /path/to/project --adapter codex
stetra status /path/to/project
```

Review the generated project Hooks when Codex requests trust. Initialization
protects owner-modified content; inspect a conflict before choosing a replacement.
Add `--adapter claude` alongside `--adapter codex` to generate both adapters.
Codex is the reference Host; Claude's adapter has automated transport coverage.

## Give a requirement and review its result

For example: “Use Stetra for this task. Add cancellation to the import flow,
preserve already imported rows, and explain the failure and recovery behavior.”
Admission defaults to `ask`; an explicit instruction like this already admits
the task. Conversation alone creates no task. An explicit project policy in
`.stetra/config.json` can admit coding tasks without asking each time.

The Agent preserves the request, implements and verifies the change, obtains
analysis, and repairs findings within your existing authorization. Check progress
appears as each step runs. A new choice that needs your authority is presented
with its alternatives and consequences; independent work can continue.

The final brief explains behavior, mechanism, important choices, observed checks,
open findings, limitations, and the Agent recommendation. Respond naturally:
accept the presented result and named limitations, request a correction, reject,
or defer it. The Agent records your exact response against that result. You do
not need to write JSON or copy IDs. Acceptance does not commit or merge code;
those remain separately authorized repository actions.

## Continue after an interruption

`stetra status .` lists unfinished tasks. Tell the new Codex session which one
to continue. The Agent uses `task resume` with that exact task and its current
Host token; the command creates no new task and reruns no checks. If more than
one task fits, specify the intended task rather than relying on “latest.”

Historical source, patch, checks, and logs remain tied to their Analysis Request.
Edits require fresh collection. Timeout retry requires an actual timeout and a
larger bounded budget; non-timeout failures have one explicit refresh for
unchanged inputs. After a storage failure, inspect retained history before
retrying: checks may have run even if their Observation was not published.

Separate analysis is Agent judgment. Native Hooks establish result routing;
they do not prove semantic truth or effective read-only permissions. Codex may
override Analyzer defaults with the parent permissions. Missing analysis or
unavailable boundaries must remain visible in the final decision.

See [the executable workflow](change-workflow.md) for command schemas and
[Host validation](host-validation.md) for measured integration evidence.
