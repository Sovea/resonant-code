# Decision-aware runtime implementation plan

Status: approved implementation specification; implementation is underway.
The executable implementation still uses `cognitive-adoption` schema `2`.
Commands, files, and APIs described as new below are not implemented yet.

This plan implements [Architecture](architecture.md) directly, with Codex as
the first Host. It requires engineering verification, not a preliminary
prototype, paired effectiveness experiment, or another product-direction
decision. Claude Code is a second adapter that can ship in the same effort;
its completion does not gate the Codex release.

The source baseline is local commit `49700bc`, including the current schema `2`
task workflow. The earlier shared discussion examined an older implementation.
Do not recreate or remove obsolete modules merely because that discussion
mentioned them. Current behavior is documented in
[Change workflow](change-workflow.md).

## 1. Scope and implementation choices

- Keep the two published TypeScript packages and the dependency direction:
  generated Host adapter -> CLI Runtime -> Core.
- Replace the task domain, semantic authoring inputs, and task projection.
  Preserve useful Git, Check, process, initialization, and recovery mechanisms.
- Use the initial versions: package `0.0.1` and `schemaVersion: 1`, with
  `protocol: cognitive-adoption`. This is a fresh implementation with no legacy
  compatibility, migration, aliases, or version translation.
- Implement in-work Intent revisions, engineering Decisions, separately
  attributed Assessments, Reconciliation, and adoption of an exact Package.
- Run the Analyzer through the Host's native agent facilities. Core and CLI
  never invoke an LLM, select a model, or schedule an agent execution loop.
- Keep routine authoring small: behavior, mechanism, evidence references,
  and a final recommendation. Optional semantic dimensions appear only when
  material. A task may legitimately have no engineering Decision records.
- Preserve explicit routine/consequential assurance and bounded Adoption
  Concerns. Do not add an assurance framework, scores, cross-task memory,
  transcript ingestion, or a deployment/merge function.

## 2. Domain records and ownership

These are immutable task artifacts, not separate services or independent
lifecycles. Runtime assigns IDs, revisions, ordering, and fingerprints. Agent
inputs use readable keys and source references; they do not construct storage
records. Exact field validators will live in TypeScript, with generated JSON
Schema and examples. The descriptions here specify semantics, not a parallel
validation specification.

| Record | Concrete contents and consumer |
|---|---|
| Human Event | Exact admitted request, correction, engineering resolution, or adoption response; retain source provenance separately from Agent interpretation. |
| Intent Revision | Original request reference, applicable correction references, compact interpreted outcome, constraints, non-goals, and referenced authorization. Used during implementation and assessment. |
| Verification Plan Revision | Exact check definitions, declared inputs, verifier selectors, and the reason/authority for a revision. Execution budgets remain operational inputs recorded with attempts. Used by collection and evidence validation. |
| Decision Proposal | Concrete fork, viable options, consequences, proposed selection, dependencies that must wait, Intent basis, and claimed existing authority. Used to continue autonomously or obtain a necessary Human choice. |
| Decision Resolution | Exact proposal revision and selected option; either attributed Agent judgment within referenced authority or an exact Human Event. Superseding a proposal does not inherit its old approval. |
| Observation | Existing baseline/change/check facts, plus the verification plan used. Its factual identity does not depend on the current wording of the Intent. |
| Implementation Report | Implementer's explanation of actual behavior and mechanism, links to material Decisions and evidence, optional maintenance implications, and responses to earlier findings. It does not contain the final adoption recommendation. |
| Analysis Request | Frozen references to the effective Intent, Decision state, Observation, report, unresolved prior findings, and supplied context. Provides reproducible inputs and a result-correlation ID. |
| Assessment | Analyzer's before/after model, evidence-linked claims, relations to Intent/Decisions/report, findings, unknowns, and review entry points. Includes separately recorded execution provenance. |
| Finding Response | Attributed explanation, counterevidence, requested investigation, or claimed repair tied to a source finding. A response cannot delete the finding or certify its own correctness. |
| Adoption Package | A frozen manifest of the presented result and the implementer's final recommendation, with rebuildable presentation. Includes findings, responses, mechanical Attention, and unresolved Human choices. |
| Adoption Decision | A later exact Human Event, the Package it refers to, action, and explicitly acknowledged limitations. It has no Git or external side effect. |

### Intent and engineering Decisions

`task amend` accepts an exact Human correction and an updated Agent
interpretation while work is active. It never replaces the original Git
baseline. Purely Agent-authored clarification can revise interpretation but
cannot alter a Human outcome or constraint; the input explicitly distinguishes
these cases.

A Decision records an important autonomous choice without asking for fresh
permission when existing authority suffices. When authority is missing, the
proposal presents the concrete alternatives and the work that depends on them.
The developer continues answering in the Host conversation.

Human resolution requires the exact proposal revision and response. Runtime
checks that the referenced option and source exist; it does not decide whether
the prose actually authorizes the change. Unattested relays remain visibly
unattested. An Analyzer can later contest the Agent's application of authority.

After an Intent revision, historical resolutions remain intact. Their
applicability to the new Intent needs an attributed revalidation or a new
resolution. Runtime must not silently reuse approval, and must not demand a
new Human message merely because an already-authorized choice is revalidated.

Pending Human choices produce focused Host guidance and block final acceptance
until resolved or explicitly superseded through Human authority. Investigation
and unrelated authorized implementation may continue. The first release does
not claim to infer semantic dependencies from arbitrary tool calls or shell
commands. Any later tool-level control must name the exact native operations it
can enforce; there is no generic `PreToolUse` policy engine in this change.

### Verification plan revisions

`verification revise` preserves every previously executed definition and Check
Attempt. Adding checks within the accepted outcome is ordinary Agent work.
Weakening or replacing Human acceptance criteria requires the corresponding
Human correction; a check-plan edit alone cannot rewrite them.

Each new plan is frozen before its collection. The initial implementation
executes all checks in a changed plan and preserves prior results as history.
It does not introduce cross-plan partial result caching. Within an unchanged
plan, retain the current deduplication, actual-timeout retry with a larger
bounded budget, and one explicit non-timeout refresh per unchanged worktree,
declared inputs, and delivery Attempt. Routine Begin does not run checks.
Increasing the budget for an actual timeout does not change the semantic check
or verification-plan identity.

## 3. Core API and package structure

Replace the two-function delegation/handoff API with one closed task domain.
The public runtime exports are planned as:

| Export | Responsibility |
|---|---|
| `schemas` | Exact command and artifact schemas, plus protocol identity; used by Core validation, CLI input discovery, and generated examples. |
| `planTransition(state, command, runtimeInputs)` | Validate a finite task command against current records and caller-supplied facts; return immutable domain artifacts and a typed event, or structured issues. |
| `reduceTaskEvent(state, event, artifacts)` | Rebuild task state from committed events and referenced artifacts. The same reducer is used when applying a planned transition. |
| `evaluateAdoption(state, currency)` | Derive binding validity, required acknowledgments, unresolved choices, evidence ceilings, and the data for an Adoption view. |

`runtimeInputs` contains Runtime-assigned identities and already-observed IO
results. Core does not generate Host actions, read project configuration, run
checks, write artifacts, or call a model. Command/event unions are closed over
this task domain; there is no configurable workflow graph or plugin dispatcher.
Timestamps belong only to lifecycle event envelopes and do not participate in
semantic identity. CLI supplies them when committing a transition.

Move canonical domain and semantic input validation into Core using Zod, which
the CLI already uses. Infer TypeScript types from the schemas. Keep structural
reference checks in domain functions, but remove duplicated hand-written shape
validators. CLI-local schemas remain appropriate for configuration, storage
envelopes, and each Host's wire payloads. Package tests must include Core's new
runtime dependency.

Proposed source layout:

```text
packages/core/src/
  protocol.ts
  authority/
  intent/
  decisions/
  observations/
  assessments/
  adoption/
  task/                 # finite commands, events, reducer, transitions
  schemas/
  index.ts

packages/cli/src/
  workflow/
    begin.ts
    amend.ts
    decisions.ts
    verification.ts
    collect.ts
    report.ts
    assessment.ts
    adoption.ts
    inspect.ts
    task-store.ts
  facts/                # preserve Git, Check, input, and environment collectors
  presentation/         # compact task and adoption views
  host/
    session.ts
    analysis-binding.ts
    codex.ts
    claude.ts
  adapters/             # generated Skills, agent definitions, Hook fragments
  project/              # ownership-safe initialization
```

Split `workflow/task.ts` by operation as the new paths replace it. Do not put
new behavior beside a permanent legacy task runtime. The current Core
`delegation/` and `handoff/` implementation is replaced; useful fact types and
validation invariants move into `observations/` and `adoption/`.

## 4. CLI and ordinary Host workflow

The primary path is:

```text
task begin
  -> normal Host implementation
  -> task collect
  -> task report
  -> Host Analyzer returns Assessment
  -> adoption prepare
  -> exact later Human response
  -> adoption decide
```

Separating report from final recommendation is intentional: the implementer
must be able to respond to the Assessment without changing the report that the
Analyzer inspected and invalidating its own inputs.

| Command | Agent input and Runtime result |
|---|---|
| `task begin` | Exact admitted event, interpretation, assurance, verification; atomically publish Intent and full dirty baseline. |
| `task amend` | Exact correction or explicitly attributed interpretation revision; preserve history and invalidate dependent semantics. |
| `decision propose` | Concrete options and authority basis; optionally include an Agent selection within existing authority. |
| `decision resolve` | Exact proposal key/revision, selected option, and appropriate Human or Agent source. |
| `verification revise` | New plan and reason/authority; preserve old definitions and attempts. |
| `task collect` | Collect or reuse current Observations using the existing check/recovery semantics. |
| `task report` | Freeze the implementation report and create/reuse its Analysis Request; return bounded analysis inputs and result schema discovery. |
| `assessment submit` | Bind a schema-valid result to one exact Analysis Request. Primarily a Hook/internal transport operation; also supports an explicitly attributed portable relay. |
| `adoption prepare` | Final recommendation and optional finding responses; verify currency and freeze a Package that includes the Assessment and all remaining gaps. |
| `adoption decide` | Exact later Human response and presented Package ID; preserve acknowledgment, correction, rejection, or deferral. |
| `task inspect` | Bounded summary, Intent, Decisions, observations/checks, report, analysis inputs, assessment, adoption, source snapshots, or history. |

All semantic inputs use stdin or a file outside the observed worktree. Retain
`--input-schema --json` using the actual validators. Every mutation returns
the task's phase, compact changed/current information, and a bounded semantic
next step. There is no `hostAction`, Draft/Guide exchange, or Agent-authored
canonical state.

An ordinary command sequence, with placeholders rather than executable
examples of the future payload schema:

```sh
stetra task begin . --input - --json
# Implement through normal Codex tools; propose/resolve a Decision only if needed.
stetra task collect . --task <task-id> --json
stetra task report . --task <task-id> --input - --json
# Codex invokes the configured Analyzer; its result is submitted by the adapter.
stetra adoption prepare . --task <task-id> --input - --json
# Present the Package and await the actual developer response.
stetra adoption decide . --task <task-id> --package <package-id> --input - --json
```

The Package ID is explicit at decision time. Runtime must never silently bind
an answer about an older Package to whatever Package happens to be current.

For a deliberate new analysis of unchanged inputs, `task report --reassess`
requires an Agent-authored reason. It creates a new request referencing the
same report instead of manufacturing a report revision. An identical ordinary
`task report` call reuses its request. Superseded requests remain inspectable,
and a late result cannot replace a newer selected analysis round.

## 5. Analysis inputs, results, and Reconciliation

### Input binding and source access

An Analysis Request binds these independent inputs:

```text
effective Intent revision
+ effective Decision state digest
+ Observation ID and verification plan identity
+ implementation report ID
+ unresolved earlier findings and their responses
+ supplied context manifest digest
```

The manifest references retained records and Git snapshot objects rather than
copying the entire repository or transcript into another artifact. The initial
view contains exact direction, actual changes, check outcomes, report, relevant
Decisions, and visible omissions. Additional source/log inspection is bounded
and reports truncation explicitly. Path selection is a retrieval operation,
not a Runtime judgment of semantic importance.

Add truly read-only inspection of baseline and collected source bytes, for
example `task inspect --section source --request <id> --snapshot baseline|current
--path <path>`. Code references resolve against those snapshot objects, with
digest and optional line range; check references resolve to exact Attempts.
Unchanged surrounding files can also be read from the full captured snapshot.
The Analyzer can reconstruct old behavior without treating the current file as
the baseline or asking the implementer to supply the old code.

Current `loadTask` repairs `task.json` during a read. Refactor loading so the
Analyzer's frozen inspection path performs no writes, cache repair, collection,
or check execution. Projection repair belongs to a writable Runtime operation;
a missing cache can be reconstructed in memory for a read.

### Assessment structure

The Analyzer first reconstructs actual behavior from code and observations,
then compares it with the implementation report and declared Decisions. Its
instructions require a separate judgment, not agreement with the implementer.

Assessment contains:

- material before/after claims and mechanism, with source/check references;
- ownership, invariants, failure/recovery, effects, and tradeoffs when material;
- explicit relations from claims to the request, corrections, Decisions, and
  report, including a stated gap where the Analyzer finds no explanation;
- findings about unexplained change, direction conflict, claim/evidence
  contradiction, or insufficient evidence;
- uncertainty and concrete review entry points, without confidence scores.

An absent Decision does not imply absent authority: the original request may
already permit the change. A retrospective explanation is marked as a current
explanation, not evidence that the implementer historically made that choice.

Runtime validates record existence, source digests, input bindings, attribution,
and declared evidence ceilings. It does not use token overlap, filename rules,
or another heuristic to decide that a claim follows from code.

### Findings and follow-up

Persist source findings independently of their later dispositions. The
implementer may supply counterevidence or a proposed repair. A claim that a
finding is fixed remains an attributed response until a subsequent Assessment
addresses it; Human acknowledgment instead permits adoption with that finding
still disclosed.

New assessment rounds receive every unresolved earlier finding automatically.
A new Assessment explicitly addresses them or the Package retains them as
unresolved; omission cannot make a finding disappear. A claim that changed
scope supersedes a finding also needs an attributed disposition. There is no
nested challenge or obligation graph.

Code repair requires new collection, report, and Assessment. A changed factual
explanation goes through `task report` again. A final recommendation or disputed
response can be included by `adoption prepare` without modifying the earlier
Assessment; the Package displays the disagreement. Further analysis is an
ordinary explicit Host action, not a Runtime-controlled loop.

For example, an authorized cache optimization adds a stale-read fallback. The
Analyzer links that behavior to the actual branch and tests and flags that the
report only explained performance. The implementer can explain the fallback,
repair it, or propose a necessary choice about freshness. Runtime verifies the
references and keeps any unresolved conflict visible; it does not decide what
freshness guarantee the prose means.

## 6. Currency, task progress, and adoption

Keep a small task projection: active/closed lifecycle, current delivery Attempt,
current record references, effective Decision state, and unresolved Human
choices. Derive `Align -> Work -> Decide` and the next action from those records.
Do not persist a second manually synchronized readiness state machine.

Use separate binding digests instead of invalidating everything whenever the
event sequence advances:

| Change | Can remain reusable | Must be reconsidered or rebuilt |
|---|---|---|
| Human correction or interpretation revision; unchanged code/check plan | Baseline, prior Observations and check results as facts | Decision applicability, current report, Assessment, Package |
| Effective Decision changes | Baseline and otherwise-current checks | Report/Assessment bindings and Package |
| Verification plan changes | Baseline and historical attempts | Current verification collection, report, Assessment, Package |
| Worktree or declared execution inputs change | Baseline and all historical records | Current collection and its dependent report, Assessment, Package |
| Implementation report changes | Current Observations | Analysis Request, Assessment, Package |
| Final recommendation or a finding response changes | Observations and the Assessment as an attributed source | Package; response does not silently resolve the finding |
| A duplicate command or identical Hook delivery | All current records | Nothing; return the existing result |

An Assessment can be stored after its inputs become stale, so useful work is
not lost, but it cannot become the current adoption basis. A stale result is
reported as such; it is never silently rebound to newer code.

`adoption prepare` and `adoption decide` re-observe worktree and declared input
currency. They must not rely only on a Hook's dirty flag or modification time.
The worktree lease coordinates Stetra operations; it cannot lock an external
editor. Adoption records the exact observed snapshot, and later changes make
that record historical. Stetra does not claim an atomic lock over all writers.

A Package starts with the requested Human choice and implementer recommendation,
then explains actual behavior, material Decisions/authority, maintenance
implications, Runtime checks, Analyzer findings, responses, and review focus.
The default view is concise; full source, patches, logs, and history remain
inspectable. It is CLI/Host presentation, not a new web application.

Mechanical Attention includes failed/absent required checks, changed verifier
surfaces, check-induced changes, unrepresentable changes, unavailable or weaker
analysis provenance, unresolved findings, and declared concern gaps. A positive
recommendation cannot imply that missing or contradictory evidence passed.
The view can express adoption with disclosed limitations.

Acceptance requires a current Package, resolved necessary Human choices, an
exact later Human response, and explicit acknowledgment of the limitations in
that Package. Acknowledgment neither erases facts nor makes an Assessment true.
Rejection, correction, and deferral can refer to a historical Package without
claiming that it is current. A correction advances the delivery Attempt and
Intent while retaining the original baseline; deferral keeps the task open.
No decision commits, merges, deploys, or changes cross-task policy.

## 7. Persistence and interruption recovery

Retain task-local immutable artifacts, private Git objects, staging publication,
task revision checks, worktree leases, and exact Host session associations.
Use a small append-only event journal with one atomically published file per
event, replacing `events.jsonl` in the new schema to avoid a torn appended line.

```text
.stetra/tasks/<taskId>/
  events/00000001.json        # committed ordering and artifact references
  artifacts/<artifactId>.json # typed immutable domain records
  logs/<attemptId>/...        # non-empty bounded Check streams
  worktree-objects/           # captured Git snapshot objects
  task.json                  # rebuildable projection cache

.stetra/staging/              # owned incomplete Runtime publication
.stetra/host-sessions/        # opaque bindings and bounded continuation markers
```

One mutation performs: acquire task lock and check expected revision; validate
the proposed transition; publish immutable artifacts; atomically publish the
next event as the commit point; update the projection cache. Use file/directory
flushes where supported for the claimed durability level. Begin publishes its
staged directory only after compilation and baseline capture succeed.

Replay committed events through Core and validate their referenced artifacts.
Artifacts left before an event commit are unreferenced; they do not advance the
task. Recovery never invents missing events, skips corrupted history, or
replaces the original baseline. Only known owned staging data is eligible for
cleanup. A failed cache write is recoverable from the committed journal.

Long Git/check collection and Host analysis do not hold a task lock while
waiting. Collection retains its worktree lease and rechecks task revision at
publication. An analysis result is committed against its explicit request;
current input bindings determine whether it is usable or historical.

Repeated submission of identical results for the same request is idempotent.
A different result cannot overwrite an already committed Assessment; it needs
an explicitly new analysis round. Preserve current interrupted-Begin recovery
through the exact pending session association rather than scanning for a
plausible task.

## 8. Codex reference adapter

Generate and manage:

```text
.agents/skills/stetra/SKILL.md
.agents/skills/stetra/references/...  # generated schema examples and guidance
.codex/agents/stetra-analyzer.toml
.codex/hooks.json                    # only Stetra-owned Hook fragments
AGENTS.md                           # only the marked Stetra pointer block
```

Codex documents project custom agents under `.codex/agents/`, with an agent
name, description, developer instructions, and configurable sandbox settings.
Use a dedicated Analyzer profile requesting `sandbox_mode = "read-only"`;
leave model and reasoning settings inherited from the user's Host configuration.
The generated Skill explicitly asks Codex to invoke that profile when the
frozen report needs assessment. This is one semantic role, not a Stetra agent
scheduler. See [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

Prefer a separate analysis context containing the frozen input bundle and
needed source access. Record whether the Host actually establishes a separate
agent identity, what context lineage is observable, and which execution
restrictions are established. Configuration intent or an Agent assertion does
not prove fresh context, model independence, or sandbox enforcement.

### Read-only result transport

The Analyzer returns a bounded, schema-valid JSON result as its final output;
it does not run a mutating `assessment submit` command. The main Agent's final
response remains normal conversation, without a special command protocol.

For the native Codex path:

1. `task report` creates an Analysis Request and an opaque pending association
   for the bound parent session. Permit one pending invocation of the Stetra
   Analyzer per session; do not manage unrelated Host subagents.
2. `SubagentStart` for the exact Analyzer profile binds its native `agent_id`
   to that request and injects the request reference. Preserve native parent
   session/turn identity when actually supplied.
3. `SubagentStop` receives the final result directly, validates its exact JSON
   schema and request binding, and submits it through the Runtime. Persist the
   bounded Assessment and minimal source receipt, not the event stream or
   transcript. The receipt records only observed identity and output binding.
4. `adoption prepare` checks live currency and consumes the stored result. A
   result received from the Host can still be stale or semantically wrong.

Codex documents `agent_id`, `agent_type`, and `last_assistant_message` for
`SubagentStop`, so this transport does not need transcript parsing. Its Hooks
also distinguish subagent completion from main `Stop` continuation. See
[Codex Hooks](https://learn.chatgpt.com/docs/hooks).

Hook ingestion performs bounded local validation/storage, not Git collection,
tests, or model invocation. Missing identity, ambiguous binding, denied Hook
writes, malformed output, or unsupported Host fields produce an explicit
transport gap. Do not parse Markdown fences or free prose to guess a result.

The portable fallback lets the parent submit the structured returned payload
with `assessment submit`. Record it as Agent-relayed, with any declared
separate-context claim distinguished from Host-observed provenance. If no
separate context is available, label same-context assessment or unavailable
analysis visibly. These paths do not establish Host-attested isolation.

### Hooks, recovery, and stop behavior

| Event | Stetra behavior |
|---|---|
| `SessionStart` | Recover only the exact bound task; inject compact phase and pending direction/decision information. Do not admit a task. |
| `SubagentStart` | Bind only an already-requested Stetra Analyzer; inject its read-only analysis scope. Do not bind it as the main implementer. |
| `SubagentStop` | Ingest only the bound Analyzer's structured result; an invalid response may receive one bounded format-repair continuation. |
| Main `Stop` | Present a pending Human choice or current adoption brief; request at most one continuation for an otherwise unfinished unchanged state. |

Some native events share the parent's session identity. Route by actual event
kind, profile, and child identity rather than `session_id` alone, and prevent
recursive Analyzer invocation. Ordinary `UserPromptSubmit` and tool events are
not persisted or used to infer admission or Human decisions.

An unavailable Analyzer does not cause an endless retry. After bounded
recovery, show the gap and allow the Host to stop. The task remains inspectable;
Runtime does not fabricate a clean Assessment. Model/subagent limits and user
cancellation remain Host-owned.

## 9. Claude Code and initialization

After the Codex vertical path works, reuse the same domain, authoring inputs,
analysis bundle, result schema, and adoption presentation for Claude Code.
Generate `.claude/skills/stetra/`, `.claude/agents/stetra-analyzer.md`, a managed
`CLAUDE.md` block, and owned fragments in `.claude/settings.json`.

Map native fields and control responses in a separate parser/renderer. Claude
Code also documents a subagent's final message on `SubagentStop`; share the
Runtime ingestion function, not an assumed identical wire contract. Its
agent tool restrictions and permission inheritance need adapter-specific
handling. In particular, removing Edit/Write while retaining arbitrary Bash
does not establish read-only execution. See
[Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and
[Claude Code Hooks](https://code.claude.com/docs/en/hooks).

Keep the first Claude profile limited to native read/search tools, with the
bounded frozen analysis input supplied by the parent. Do not grant arbitrary
shell execution merely to expose Stetra's inspection CLI. If that profile
cannot inspect necessary baseline material, the parent can supply additional
Runtime snapshot output, and the Assessment must disclose missing context.
Its capabilities remain distinct from the intended Codex read-only sandbox path.

Change new-install defaults to Codex only. Explicit `--adapter claude` and
`--adapter codex --adapter claude` remain available when the corresponding new
adapter passes its contract tests. Generate only the new workflow.

Retain manifest-owned files, marked blocks, JSON fragment merging, dry-run
planning, drift detection, and protection of unrelated owner data. Add the
custom agent files to the same ownership plan. Do not silently enable global
Host features, change model preferences, or overwrite user agent profiles.

Validate all input against the current exact schemas before mutation. Do not
add legacy-format recognition or conversion. Preserve unknown owner data and
fail without partial writes when an existing installation is incompatible.

## 10. Concrete source changes

| Current area | Action |
|---|---|
| `core/src/delegation/`, `core/src/handoff/` | Replace with the new Intent/Decision/Assessment/Adoption domain and reducer. |
| `core/src/facts/`, `core/src/authority/` | Preserve useful observation invariants and exact-event attribution; adapt the new schema and references. |
| Both protocol modules and `core/src/index.ts` | Use initial schema `1`, one canonical domain schema source, and the new public API. |
| `cli/src/schemas/task.ts`, `task-input.ts` | Replace old task shapes; derive command discovery/examples from imported domain schemas. |
| `cli/src/workflow/task.ts` | Replace the monolithic workflow with operation modules; remove old handoff/decide routing once the new path passes. |
| `cli/src/workflow/task-store.ts` | Retain ownership, locks, staged publication, revision checking; add typed-event replay, atomic event files, idempotent submissions, and read-only loading. |
| `cli/src/facts/worktree.ts` | Preserve complete dirty-baseline collection, modes, operations, digests, patches, binary markers, private objects; add bounded immutable source reads. |
| `cli/src/facts/checks.ts`, `execution-inputs.ts`, `environment.ts` | Adapt plan/observation references; preserve adverse evidence, input currency, budgets, and retries. |
| `cli/src/infrastructure/` | Reuse process execution, executable resolution, descendant termination, and bounded-log infrastructure. |
| `cli/src/workflow/decision-brief.ts`, `presentation/` | Replace Handoff brief with one shared task/adoption projection for CLI, inspect, and Hooks. |
| `cli/src/commands/` | Add conditional Decision/verification operations and report/assessment/adoption commands; retain generated input discovery. |
| `cli/src/host/session.ts`, `hook.ts` | Retain exact parent recovery and bounded Stop markers; split native adapters and add request-to-child binding. |
| `cli/src/adapters/`, `project/init.ts` | Generate new Skills and Analyzer profiles; extend ownership planning and Codex-first defaults. |
| Release scripts and package tests | Update expected exports/schema, paired package installation, generated adapter contents, and new Core dependency closure. |
| Architecture/workflow/README/evaluation docs | Keep planned vs executable behavior explicit; update actual usage when implemented. Update the evaluation protocol before any later effectiveness study. |

## 11. Implementation increments and acceptance

These are implementation checkpoints within one redesign, not parallel released
schema versions. Each increment includes tests for its changed behavior.

| Increment | Deliverable | Acceptance evidence |
|---|---|---|
| 1. Domain kernel | Initial schema `1`, authoritative source schemas, Intent revisions, Decisions, verification revisions, events/reducer | Exact Human text and provenance preserved; no approval reused for a changed proposal; same inputs yield the same transitions; invalid references and unsupported schemas rejected. |
| 2. Runtime and collection | New journal/projection, begin/amend/decision commands, reused Git/check collection, source inspection | Dirty/untracked baseline retained; interrupted publication recovers; no checks at routine Begin; failed/timeout/check-mutated facts retained; read-only inspection writes nothing. |
| 3. Semantic delivery | Report, frozen Analysis Request, Assessment submission, finding responses, Package and Human decision | Stale or wrong-request results cannot become current; findings survive omission/disagreement; final recommendation can respond without rewriting the assessed report; old Package cannot receive a new acceptance. |
| 4. Codex vertical path | Generated Skill/profile/Hooks, native result ingestion, portable fallback, concise adoption view | Real Codex session completes begin -> work-time choice/correction -> collect -> analyze -> present -> Human decision; recovery, child routing, readonly transport, and fallback are verified. |
| 5. Claude adapter and release | Claude native mapping if included, owner-safe initialization, docs, paired archives | Any advertised Host passes its full path; clean installs and drift cases pass; isolated Core and paired Core/CLI archives work without workspace dependencies. |

Include failure cases that would change the developer's decision:

- Human correction during implementation and while analysis is running;
- autonomous authorized choice versus a choice that needs a Human response;
- report and passing checks that omit a material behavior change;
- contradictory check evidence, modified verifiers, binary changes, and
  changes made by checks themselves;
- wrong task/request/agent binding, duplicate delivery, missing result fields,
  denied result writes, and a stale late Assessment;
- an implementer claiming a finding is resolved without corresponding review;
- main/child session collision, recursive analysis, interrupted Host recovery,
  and repeated unchanged Stop;
- a worktree edit after Package preparation but before Human acceptance;
- crash before/after event publication and a missing/corrupt projection cache;
- modified generated files, unknown agent profiles, JSON fragments belonging to
  others, and unsupported old configuration without partial writes.

Retain applicable coverage in the current Git/check/process/recovery tests.
Replace tests tied only to the old delegation/handoff surface. Tests assert
observable behavior and authority/currency boundaries, not implementation
function names or fabricated effectiveness scores.

Before release run:

```sh
corepack pnpm verify
corepack pnpm audit --audit-level high
```

The native Codex session check verifies an integration contract; it is not a
product-effectiveness experiment. Record the actual Host build/capabilities
tested before claiming support. An unavailable Host leaves that acceptance item
unverified rather than turning fixture tests into a native integration claim.
Improved developer understanding or lower adoption cost remains an unmeasured
product claim until later evidence and an explicit product-owner conclusion.
