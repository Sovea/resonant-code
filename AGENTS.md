# AGENTS.md

## Repository purpose

Stetra is a Decision-aware Agent-native Adoption Runtime. It connects exact
developer direction, engineering choices during implementation, observed
changes, attributed semantic assessments, and Human adoption within one
admitted task.

It is installed into Codex, Claude Code, Pi, Trellis, and similar execution
Hosts as a project layer. It is not a Coding Agent, chat entry point, planner,
repository wiki, transcript store, prompt library, general workflow engine,
multi-Agent orchestrator, or automatic approver.

Read `docs/architecture.md` before changing product boundaries, authority,
persistence, lifecycle, public APIs, or Host integration. Read
`docs/change-workflow.md` before changing CLI protocol or task behavior. Keep
implemented behavior, planned architecture, and measured product evidence
explicitly separate.

The product owner has adopted the Decision-aware redesign and chosen to proceed
without prerequisite experiments. Implement that direction directly. Product
effectiveness studies do not gate design or implementation; engineering
verification and honest claims remain required. The executable protocol uses
initial schema `1` and paired package version `0.0.1`.

## Product kernel

One admitted task contains:

1. **Intent** — exact Human direction and corrections, compact Agent
   interpretation, constraints, and current authorization.
2. **Decision** — important engineering choices discovered before or during
   work, their alternatives, consequences, and resolution authority.
3. **Observation** — Runtime-observed baseline, actual change, Check Attempts,
   bounded logs, verifier mutations, and currency.
4. **Assessment** — separately attributed semantic judgments about actual
   system changes, omissions, contradictions, evidence, and unknowns.
5. **Adoption** — explicit Human authority bound to one exact current result,
   its Assessments, and disclosed limitations.

Reconciliation connects assessed changes to Intent, Decisions, the
implementation report, and Observations. Runtime validates structural bindings;
semantic correspondence remains Agent judgment. An unrecorded Decision is not
proof of missing authorization, and an isolated Analyzer is not a truth oracle.

The developer and Agent see `Align -> Work -> Decide`. Internal state and
identity are Runtime concerns, not an Agent protocol.

## Admission and proportionality

Stetra creates state only for an admitted coding task. Non-coding conversation
and declined work create no task and capture no prompt. Admission comes from an
exact Human choice or project policy. Runtime must not infer it from keywords,
paths, dependencies, diff size, or file count.

Routine is the default. It requires no Conditions, Evidence Obligations,
structured diagnosis, baseline checks, Host-policy claims, or Review Decision
graph. Consequential assurance is enabled only by an exact Human choice or
explicit project policy and adds bounded Adoption Concerns with concrete
evidence consumers.

Do not add scalar trust, readiness, confidence, complexity, risk, productivity,
or quality scores. Separate semantic Assessment and Reconciliation are adopted
core capabilities, not an optional experiment. Do not restore nested obligation
graphs, a general Independent Challenge workflow, or broad Host attestation.
Decision coverage is an inspectable relation, not a score or completeness proof.

Decision Continuity is not implemented. Do not add cross-task memory,
preferences, adoption history, or another lifecycle without a concrete
decision-changing consumer and evidence that it beats a simpler workflow.

## Authority boundary

- Developers own exact requests and corrections, outcomes, constraints,
  non-goals, long-lived choices, exceptions, external effects, admission, and
  adoption.
- Agents own interpretation, investigation, design, implementation, diagnosis,
  repair, falsification, Decision proposals, implementation reports, semantic
  Assessments, review focus, and recommendation. Analyzer is a distinct semantic
  role whose output remains Agent judgment, not a new authority class.
- Runtime owns identities, ordering, frozen definitions, baselines, actual
  changes, Check Attempts, bounded logs, currency, persistence, and
  deterministic structural policy.
- A trusted Host may attest only capabilities and event identity it actually
  controls.

Human Events, Agent judgment, Runtime facts, and Host capability cannot be
relabelled as one another. Runtime validates references and structural ceilings;
it does not decide natural-language truth. A Human exception cannot erase a
contradictory fact, and green checks cannot become adoption.

## Workflow

Preserve Intent and the baseline, implement through the Host, resolve necessary
Decisions and accept Human corrections during work, collect Observations,
obtain an implementation report and separate Assessment, reconcile material
findings, and present a current Adoption Package for a later Human decision.

Existing authorization stays effective. Important autonomous choices need not
interrupt the developer. Pending Human choices block only dependent work within
the Host's actual enforcement capabilities. Semantic analysis runs through the
Host; Core and CLI do not call an LLM or orchestrate another Agent loop.
Codex is the default Host and reference adapter. Claude Code has a separate
adapter with read tools only for its Analyzer. Portable fallbacks disclose same-context
or unavailable analysis without inventing isolation guarantees.

## Runtime task path

The routine task path is:

```text
task begin -> Agent implementation -> task collect -> task report
-> Host analysis -> assessment submit -> adoption prepare -> adoption decide
```

The Agent may call `task inspect` on demand. Failed checks return ordinary
engineering evidence and the Agent repairs through its normal Host loop. An
edit after collection makes facts stale. A correction request creates a
successor Attempt while preserving prior facts, reports, Assessments, and decisions.

The primary Agent surface must remain small. Do not reintroduce `hostAction`,
owned Draft/Guide transport, full canonical protocol authoring, mandatory
Diagnosis, prose-parsed routing, or hand-written partial schema rules.

Provider Hooks may inject the current phase and request one bounded continuation
before an unfinished task stops. Repeated unchanged state becomes a warning and
permits stop. Hooks do not create authority or task state, and the portable
workflow remains usable without them.

## Begin and collect

Begin receives one exact Human Event, a compact Agent interpretation, explicit
routine or consequential assurance, and exact Check argv, a named project
profile, or a concrete no-command rationale. It captures the complete dirty and
non-ignored untracked Git baseline and publishes the task only after compilation
and baseline observation succeed. Routine Begin does not execute checks.

Collect executes every frozen argv without a shell and records the complete
baseline-to-current change. Preserve file operations, modes, digests,
representable patches, binary markers, exact Check Attempts, full-stream
digests, bounded logs, execution inputs, check-induced changes, and declared
verifier-surface mutations.

Timeout is an operational budget, not semantic identity. A timeout retry
requires an actual timeout and a larger bounded budget. After a non-timeout
failure, one explicit refresh per unchanged worktree and declared inputs in a
delivery Attempt may rerun every frozen check with the existing budgets. Its
reason is Agent judgment; prior collections and Attempts remain inspectable.
Direct Host execution is Agent evidence and never replaces a Runtime Check
Attempt.

## Assessment and adoption

Reports are authored from current collected facts and freeze an Analysis Request.
The Host Analyzer submits a separate Assessment bound to that request. Changes
to Intent, Decisions, verification, observations, or report invalidate the
corresponding current delivery. Late results remain historical. Findings survive
omission and implementer claims of repair; only explicit later Assessment
dispositions resolve them. Final recommendation belongs to Adoption preparation.
Include ownership, invariants, failure/recovery, effects, tradeoffs, unknowns,
and review focus when material.

Runtime adds mechanical Attention for non-passing checks, changed verifier
surfaces, check-induced or unrepresentable changes, stale facts, unknowns, and
declared concern gaps. It prevents concern conclusions and recommendations from
exceeding declared evidence without deciding semantic truth.

The Developer Decision Brief is concise and decision-first. It keeps Runtime
facts, Agent judgment, and Human authority separate. Adoption remains an exact
later Human Event. Decision never commits, merges, publishes, deploys, or
creates cross-task policy.

## Package and persistence boundaries

```text
Generated Host Adapter -> CLI Runtime -> Core
```

- `packages/core/` publishes `@sovea/stetra-core`.
- `packages/cli/` publishes `@sovea/stetra`.
- Core exposes exactly `schemas`, `planTransition`, `reduceTaskEvent`, and
  `evaluateAdoption` as runtime values.
- Core does not read repositories, execute commands, format CLI output, know
  Host files, or call an LLM.
- CLI owns IO validation, sequencing, Git/Check collection, storage,
  presentation, project initialization, and Host continuity.

Core and CLI versions move together. The product owner requested initial
versions for the fresh implementation: package `0.0.1` and `cognitive-adoption`
schema `1`. Do not add legacy compatibility, format recognition, migration,
aliases, translators, or dual read/write paths.

Task state lives only under `.stetra/tasks/<taskId>/`. Persist admitted Human
requests and explicit corrections or decisions, Intent and baseline,
non-duplicate Observations, Check Attempts and non-empty logs, reports, Analysis
Requests, Assessments, Adoption Packages, and Human Decisions. Do not persist Agent transcripts, ordinary Hook events,
Drafts, Guides, or data without an alignment, recovery, review, or adoption
consumer.

Use an immutable typed-event journal and replay its projection without writes.
Operational session bindings and continuation markers live under
`.stetra/host-sessions/`; they never create task authority. Preserve history and invalidate current
delivery projections when their Intent, Decisions, Observations, or analysis
inputs change. Do not create cross-task memory.

Project initialization owns its manifest, generated files, JSON Hook fragments,
and marked blocks. Plan writes before mutation, protect owner-modified content,
and never silently overwrite or delete unknown owner data.

## Engineering rules

- Use TypeScript for Core and CLI control-plane logic.
- Prefer narrow modules and explicit input/output types.
- Keep protocol state deterministic and diffable; timestamps belong only in
  lifecycle events.
- Preserve unrelated user changes in a dirty worktree.
- Use `rg`, `apply_patch`, safe repository-relative paths, and argv execution
  without a shell.
- Do not call an LLM from Core or CLI.
- Do not infer semantic importance from filenames, token overlap,
  dependencies, paths, or counts.
- Do not add persistent state without a concrete alignment, collection,
  recovery, review, or adoption decision it changes.
- Keep `dist/` generated, ignored, deterministic, and out of source review.
- Keep exact schemas in TypeScript; generated examples may illustrate them but
  prose does not duplicate field validation.

## Verification

Run:

```sh
corepack pnpm verify
corepack pnpm audit --audit-level high
```

Tests must cover changed observable behavior, including failure and recovery
paths. Distribution changes must test isolated Core and paired Core/CLI package
archives.

Deterministic tests prove consistency and distributability, not product
effectiveness. Claims about adoption cost or preserved developer cognition
require protocol-conformant paired evidence under
`evaluation/paired-agent/PROTOCOL.md` and an explicit product-owner conclusion.
That requirement governs measured-effectiveness claims, not permission to
implement the adopted architecture.
