# @sovea/stetra

Stetra connects developer direction, engineering choices, observed changes,
semantic assessment, and exact Human adoption inside the coding Host.

```sh
npm install --global @sovea/stetra
stetra init .
stetra status .
```

Initialization lets you select coding agents and installs their project guidance
and Hooks. Start a new session and ask it to use Stetra for the task:
`Align -> Work -> Decide`.

```text
task begin -> implementation -> task collect -> task report
-> Host analysis -> assessment submit -> adoption prepare -> adoption decide
```

Use `decision propose`, `decision resolve`, `task amend`, and `verification revise`
as concrete choices or corrections arise. Existing authorization remains
effective; routine work needs no invented Decisions or repeated approval.

Every authoring command exposes `--input-schema --json`. Submit compact JSON
through stdin or a file outside the worktree; use returned Runtime IDs. Inspect
frozen evidence through `task inspect`, including baseline/current source bound
to an Analysis Request. `--section adoption --live` checks current facts before
presenting the Package. Reports and Analyzer results remain distinct judgments.

Checks execute argv without a shell. Dirty baselines, untracked files, actual
changes, failed attempts, bounded logs, and verifier changes remain inspectable.
Timeout retries require an actual timeout and a larger bounded budget. One
explicit non-timeout refresh per unchanged delivery Attempt can record external
recovery. Edits invalidate current delivery rather than erase prior evidence.

The Host invokes analysis; Core and CLI do not call an LLM. Analysis provenance
and unavailable boundaries remain explicit. A native receipt establishes routing;
semantic correctness and effective permission isolation require separate evidence.

Only an exact later Human event adopts a current Package. Findings survive
omission or implementer claims of repair, and accepting limitations requires
explicit acknowledgment. Adoption never commits, merges, publishes, or deploys.
Task state lives under `.stetra/tasks/<taskId>/`; no transcript or cross-task
memory is stored. Initial protocol schema is `1`, paired package version `0.0.1`.
