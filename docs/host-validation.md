# Native Host validation

## Scope

These are local engineering and usability observations from 2026-09-06, not a
paired effectiveness study or a product-owner effectiveness conclusion. The
evaluated Runtime uses package version `0.0.1` and schema `1`. Codex CLI
`0.153.4` ran on Linux with Node `24.18.0`, `gpt-5.6-sol`, and inherited `max`
reasoning effort. Claude Code was not exercised in this live task.

The coding subject was Vite at
`924997a4bdda9115faee9bdb622fcec4fc8357f0`. The task asked for plugin lifecycle
notifications that distinguish development-server restart from final shutdown,
preview cleanup, asynchronous and repeated close behavior, errors, handled
signals, tests, and documentation. Upstream solution material was hidden from
the executor. Only the local evaluation workspace was changed.

## Codex permission boundary

The generated Analyzer's `sandbox_mode = "read-only"` is a requested default.
In the tested CLI, writable parent runtime permissions overrode both that
setting and an alternative `default_permissions = ":read-only"` custom-agent
setting. The role and its instructions loaded, but child command execution
remained writable. Switching the parent analysis turn to `:read-only` established
the tested command boundary.

| Parent configuration | Child setting | Harmless child write |
| --- | --- | --- |
| Custom profile extending `:workspace` | `sandbox_mode = "read-only"` | Succeeded |
| Custom profile extending `:workspace` | `default_permissions = ":read-only"` | Succeeded |
| Legacy `workspace-write` configuration | `sandbox_mode = "read-only"` | Succeeded |
| Legacy `workspace-write` configuration | `default_permissions = ":read-only"` | Succeeded |
| `:read-only` | Either child setting | Rejected with `EROFS` |

The parent configurations used separate scratch projects; each child attempted
a single exclusive file write without escalation or retry. Children used
`fork_turns: "none"` and inherited
model/reasoning settings. The write results and child permission metadata agreed.

The Vite reassessment used a resumed parent turn explicitly selecting
`:read-only`. Its Analyzer metadata recorded no forked conversation, read-only
filesystem access, restricted network access, and the inherited model/effort.
An attempted parent `task inspect --live` also failed with `EROFS` because live
observation creates temporary Git storage. Frozen Analysis Request and retained
source inspection remained usable; they do not require live collection.

This validates the selected Host mode. It does not establish that a custom
agent can narrow writable parent permissions, that all tools on all Hosts are
isolated, or that separate execution guarantees independent or correct reasoning.
Stetra does not switch global permissions or attest them from SubagentStop.
This observed parent/child relationship agrees with the Host's documented
[subagent permission behavior](https://learn.chatgpt.com/docs/agent-configuration/subagents#approvals-and-sandbox-controls).

## Original delivery and correction

The first native session reached a pending Adoption Package after two
Collections. All five final frozen checks passed. The Analyzer nevertheless
reported three findings:

- In-flight close operations were removed from shared signal coordination too
  early, allowing a later signal to truncate asynchronous cleanup.
- Documentation omitted the `CI === 'true'` exclusion for stdin-end handling.
- A preview HTTP-close failure could hide an already collected plugin error.

Independent checks in a copied delivery reproduced the two runtime failures and
confirmed the documentation discrepancy. The original Package recommended
correction; no acceptance was recorded.

The developer's later exact reply `同意` was recorded as `correction-requested`,
with the coordinator's explanation kept separate from Human text. A successor
Attempt retained the original baseline, reports, Assessments, and findings.
The implementer reaffirmed its existing API choice under existing authority.
The revised Collection passed all five frozen checks, including 25 lifecycle
tests, two focused signal tests, Vite type checking, declared ESLint inputs, and
format checking. The new source fixture and generated adapter updates were
included in the actual observed change.

An independent copy of that frozen delivery passed both complete changed unit
suites (145 passed, one skipped) and a fresh Vite bundle build. Actual development
and preview servers passed SIGINT and SIGTERM scenarios for normal cleanup,
plugin cleanup rejection, and a close already in progress when the signal
arrived (12 scenarios). Both servers finished cleanup before the expected exit.
The combined preview error check retained both plugin and HTTP errors and
confirmed that the HTTP server stopped listening. These external checks are
evaluation evidence, not additional Runtime Check Attempts.

The coordinator resumed the same Codex thread in separate writable repair,
read-only analysis, and writable Package-preparation stages. This is an explicit
Host setup intervention, not evidence of an autonomous permission switch by
Stetra. The implementation was authored and repaired through Codex CLI.

The first correction Analyzer was interrupted when Codex exited with code 101
without an Assessment or stderr explanation. The machine's disk was full and
an independent workspace copy also failed. Only regenerable dependency copies
and the incomplete copy were removed; source, task history, logs, and package
archives were retained. The coordinator moved the active Host state and the
independent review workspace to memory-backed storage. Codex confirmed current
facts and used explicit reassessment to retain the old request while reserving
a new one for the unchanged Report. This infrastructure failure is recorded
separately from implementation or semantic-analysis conclusions.

The subsequent read-only Analyzer completed, and the native SubagentStop Hook
recorded its Assessment against the new frozen request. It explicitly marked
all three historical findings `addressed`, citing current source and retained
checks. It also raised two new findings:

- Both dev and preview invoke a plugin close hook before assigning the memoized
  close operation. A synchronous call back into `server.close()` can therefore
  start a second hook-and-teardown pipeline.
- The Report promises the same returned Promise object, while the async public
  methods actually return distinct wrappers adopting a shared operation.

Independent reproduction in the built delivery confirmed both observations.
For dev and preview, under resolving and rejecting cleanup, a guarded one-time
reentrant call caused both plugin hooks to execute twice. Preview could then
report an additional HTTP "Server is not running" error. Repeated public calls
returned distinct Promise objects in all four cases. These are reproductions
of unresolved defects, not passing acceptance checks.

The final Package recommends `request-correction`, retains both new findings,
and is current with five passing frozen checks. No acceptance was recorded.
The prior 35 task files remained byte-identical, and the pre-analysis source
snapshot remained unchanged through Package preparation. This completed the
authorized correction-and-reassessment trial; it did not produce a Vite change
ready for adoption. The new findings remain available for a subsequent correction.

The writable repair stage took about 25 minutes, the completed reassessment
about 23 minutes, and Package preparation about two minutes. The interrupted
analysis and environment recovery added further time. These are wall-clock
observations of this configured run, not normalized model or product benchmarks.

## Observed usability limits

- The implementer initially supplied finding IDs to `acknowledge`. Runtime
  rejected them because only IDs from the presented Package's Attention are
  valid. The agent recovered by omitting acknowledgment for the correction.
- Invalid inspection combinations (`--live` with an unsupported section, and
  an unknown section) required help lookup and retry.
- The documented `report --reassess --reason` initially still required a Report
  JSON document. The live agent recovered by relaying the retained Report from
  public inspection. The subsequent CLI fix reuses the current Report under
  the worktree lease without reading stdin, rejects an explicit `--input`, and
  preserves currency and Report-binding checks. Behavior and packed native
  transport tests cover that fix; the earlier live recovery remains a record
  of the version actually exercised.
- Collection returned no per-check progress while the full Vite type check
  ran. Its eventual result retained all five Check Attempts.
- The implementer included a repair-stage deadline and phase restrictions in
  its compact Intent interpretation. Those statements remained visible during
  the later analysis and Package stages. Runtime fact currency did not resolve
  that semantic mismatch; authoring guidance should distinguish execution
  budgets from durable task constraints without parsing prose into policy.
- The final brief contained 15 Attention entries: two open findings, one changed
  verifier notice, seven Assessment unknowns, and five Report unknowns. Several
  unknowns discuss overlapping verification limits. This is an observed review
  burden, not grounds for automatically dropping or semantically merging facts.
- Real-signal regression fixtures needed ordinary module-loading and mock
  repairs before they constituted passing evidence.
- The distribution check exposed unstable declaration ordering in Core's lazy
  per-file type emission. A complete TypeScript declaration build before
  bundling restored deterministic archives; the build-only tsconfig explicitly
  enables declaration emission, and incremental output remains disabled.
- No full Vite monorepo/end-to-end suite, documentation build, or Windows
  execution is established by this record.

These observations identify concrete adapter and authoring costs. They do not
measure whether Stetra is faster, cheaper, more effective, or better at preserving
developer understanding than direct Codex use. Such claims remain governed by
[the paired-agent protocol](../evaluation/paired-agent/PROTOCOL.md).
