# Change workflow

This is the executable schema `1` workflow. Both packages use version `0.0.1`.
There is no legacy translation or migration path. The
[architecture](architecture.md) defines product authority; the
[implementation plan](implementation-plan.md) records the adopted design.
Tests establish implementation consistency and distribution, not effectiveness
at preserving developer understanding.

## Installation and admission

```sh
stetra init .
stetra init . --adapter codex --adapter claude
stetra status . --json
```

Codex is the default adapter. Initialization plans writes before applying them,
owns generated Skill and Analyzer files, and merges only its marked blocks and
Hook fragments. Unknown owner files and modified managed content are protected;
`--dry-run` previews changes. `--force` explicitly replaces modified managed
content, preserving unrelated owner data. Model preferences, global feature
flags, and Host trust are not changed.

Project configuration under `.stetra/config.json` declares admission as `ask`,
`explicit`, or `required`, optional named verification profiles, and operational
execution budgets. Conversation-only work and declined tasks create no task.
Existing Human admission remains effective. The Agent supplies the exact Human
request without trimming; relayed Human text is labelled `unattested-input`.
An opaque Host binding token provides continuity, not Human authority.

## Portable task loop

```text
task begin -> implementation -> task collect -> task report
-> Host analysis -> assessment submit -> adoption prepare -> adoption decide
```

The visible phases remain `Align -> Work -> Decide`. Exact command inputs are
defined in Core TypeScript schemas. Every authoring command exposes its input
schema and validated example without reading a repository or creating state:

```sh
stetra task begin --input-schema --json
stetra decision propose --input-schema --json
stetra assessment submit --input-schema --json
stetra adoption decide --input-schema --json
```

Use `--input -` for JSON on stdin or an input file outside the observed worktree.
Runtime supplies IDs; Agents do not author canonical records or fingerprints.
All commands after Begin require `--task <taskId>`. Mutations return a compact
status, revision, current references, observed summary, and next directive.
Schemas reject extra fields. No prose parsing selects an operation.

| Command | Purpose |
|---|---|
| `task begin` | Admit exact direction, resolve verification, and retain the complete Git baseline. |
| `task amend` | Preserve a Human correction or an explicitly attributed Agent interpretation revision. |
| `decision propose` | Record a concrete fork, alternatives, consequences, and autonomous selection or pending Human choice. |
| `decision resolve` | Resolve the exact proposal revision under existing authority or an exact Human response. |
| `verification revise` | Replace the current verification plan with an attributed authority basis; retain prior checks. |
| `task collect` | Observe the actual change and execute frozen argv checks. |
| `task report` | Explain actual implementation and freeze an Analysis Request. |
| `assessment submit` | Record a result for an exact request, including explicit same-context or unavailable fallback. |
| `adoption prepare` | Prepare the final recommendation and developer Package from current facts and Assessment. |
| `adoption decide` | Record an exact later Human acceptance, correction, rejection, or deferral. |
| `task inspect` | Read task state, frozen evidence, and historical records. |

## Direction and decisions during work

Begin takes a compact Agent interpretation, routine or consequential assurance,
and exact check argv, a named profile, or a concrete no-command rationale. It
publishes a task only after validation and baseline observation succeed. Begin
does not execute checks. Routine requires no invented Decisions or concerns.
Consequential concerns require explicit Human choice or project policy; their
check requirements bind exact definitions rather than reusable names.

Proposals identify the concrete question, alternatives and consequences, and
work waiting on a choice. An autonomous selection cites existing Human authority
with an Agent-authored rationale. `request` is a shorthand reference to the
initial Human event. Other authority references use returned Human event IDs.
An important choice does not inherently require another approval.

A proposal requiring new Human authority cannot be self-approved. A Human
resolution binds its exact proposal ID and selected option. Changing the
proposal does not reuse approval of the earlier revision. After an Intent
revision, a previous exact Human selection can be reaffirmed under its existing
authority when the same proposal and option remain applicable. Runtime validates
references; the Agent judges natural-language applicability.

Human corrections and Agent interpretation amendments remain separate records.
An Intent change invalidates current reports and Assessments; it preserves the
original baseline and any still-current Git/check facts. A verification revision
preserves earlier definitions and observations and requires collection for the
new plan. Neither command invents cross-task policy.

## Collection, failure, and currency

The baseline includes dirty tracked files and all non-ignored untracked files.
Runtime excludes only its task, staging, session, and worktree-lock storage.
Git objects retain raw bytes without clean filters or newline conversion; the
user's index is not modified. Operations, modes, content digests, representable
patches, binary markers, and original baseline references remain inspectable.
Unsupported Git paths or transport limits fail explicitly instead of silently
omitting evidence.

Checks run exact argv without a shell. They preserve preparation/assertion
steps, exits, signals, spawn failures, timeout budgets, full-stream digests,
bounded non-empty logs, declared execution inputs, and check-induced changes.
Verifier mutation coverage is limited to explicitly declared file/tree selectors.
Direct Host command execution remains Agent evidence rather than a Runtime Check
Attempt. No filename, dependency, count, or keyword infers semantic importance.

Ordinary collection reuses unchanged current facts, including failed checks.
Repair through the Host and collect again. Two explicit re-execution paths exist:

```sh
stetra task collect . --task <taskId> --retry-timeout <checkKey> --timeout-ms <largerMs> --json
stetra task collect . --task <taskId> --refresh-reason 'The external service recovered.' --json
```

A timeout retry requires a real prior timeout, unchanged worktree and declared
inputs, a larger bounded budget, and remaining retry allowance. It retains all
prior Attempts and every other Check unchanged. A non-timeout refresh requires
an actual failure and reruns every frozen Check at existing budgets; it is
available once per unchanged worktree/input set in a delivery Attempt. Its
reason remains Agent judgment. Old Observations remain immutable.

Report, Package preparation, and acceptance independently re-observe worktree
and declared-input currency. Read-only inspection and Hooks do not observe Git.
Their `factsCurrency: unobserved` is not proof that the worktree stayed unchanged.
Use `task inspect --section summary|adoption --live` before presenting a result
as current. A stale Package remains historical and cannot support acceptance.

## Report, analysis, and reconciliation

The implementation report requires actual behavior and mechanism. Material
ownership, invariants, failure/recovery, effects, tradeoffs, unknowns, Decisions,
and evidence are included proportionally. The final recommendation is separate.

Report freezes the Intent, Decision state, verification plan, Observation,
report, and prior findings into an Analysis Request. Identical reports and
identical results are reused. Explicit reassessment of an unchanged report uses
`task report --reassess --reason <reason>`. The earlier request and result remain
inspectable. A conflicting replacement result for the same request is rejected.

The Host runs the Analyzer. Core and CLI never call an LLM or create an Agent
loop. Analyzer claims reconstruct before/after behavior and mechanism, link to
source/patch/check evidence, and relate to direction, Decisions, the report, or
an explicitly unexplained change. Candidate unexplained changes, direction
conflicts, evidence contradictions, and missing evidence are Agent judgments.
Runtime checks references and bindings, not their natural-language truth.

Source inspection reads retained baseline/current Git objects, not live files:

```sh
stetra task inspect . --task <taskId> --section analysis --request <requestId> --json
stetra task inspect . --task <taskId> --section source --request <requestId> --snapshot baseline --path src/example.ts --json
```

Analysis documents larger than the inspection budget return a serialized
`analysisDocument` with digest and `nextOffset`; assemble pages using `--offset`
before analyzing. Source, patch, and log output use bounded byte pages with
explicit encoding, truncation, and next offset. Binary or partial UTF-8 pages
use base64. No evidence is discarded by a semantic relevance heuristic.

Current bindings are checked again at result submission. Late results remain
historical, and their dispositions cannot clear findings for current work.
Unresolved findings survive omission, changed explanations, and implementer
claims of repair. Implementer responses preserve disagreement and counterevidence.
A later current Assessment must explicitly address, retract, or dispute a prior
finding. Human acknowledgment accepts a disclosed limitation, not the truth of
an Agent claim.

## Adoption and the developer view

Preparation requires a current report and a current Assessment, or an explicitly
unavailable Assessment result. It binds one recommendation to one exact current
result. Mechanical Attention includes failed checks, verifier changes,
check-induced or unrepresentable changes, analysis gaps, relayed/same-context
provenance, unknowns, unresolved findings, and declared concern gaps. A plain
`accept` recommendation cannot exceed those structural limits.

The text and JSON Package distinguish the Agent recommendation, actual behavior,
important choices and authority, Runtime observations, Analyzer judgment,
finding responses, maintenance entry points, and pending Human choice. Details
remain inspectable through `task inspect`.

Acceptance requires the exact current Package ID, current observed facts,
resolved Decisions, and explicit acknowledgment of every Attention ID. An exact
later Human event records accepted, correction-requested, rejected, or deferred.
Correction creates a successor delivery Attempt with new interpretation while
preserving the original baseline and earlier delivery. Deferral leaves the task
open; acceptance and rejection close it. Adoption never commits, merges,
publishes, deploys, or grants unrelated authority.

## Host adapters

Codex initialization generates `.agents/skills/stetra/SKILL.md`,
`.codex/agents/stetra-analyzer.toml`, owned `.codex/hooks.json` fragments, and an
`AGENTS.md` pointer. The Analyzer requests a read-only sandbox and inherits
session model/reasoning settings. The Skill requests `fork_turns: "none"` and
explicit frozen inputs rather than copying the implementation conversation.
This controls conversation inheritance; it does not attest independent reasoning.
Codex can reapply parent runtime permissions over custom-agent defaults. A
read-only setting in the generated file is therefore not proof of enforced
read-only execution. Use the Host's effective read-only permission mode for the
analysis turn when needed, returning to implementation permissions for repair
or Package preparation. Disclose an unavailable boundary; Stetra does not
change global Host permissions or certify permissions from a Hook receipt.
See [Codex subagent permissions](https://learn.chatgpt.com/docs/agent-configuration/subagents#approvals-and-sandbox-controls).
Claude Code initialization generates its
Skill, `.claude/agents/stetra-analyzer.md`, settings fragments, and `CLAUDE.md`
pointer. Its Analyzer allows only Read/Grep/Glob; the parent supplies frozen
input, source, and result schema. These are different capability requests.

SessionStart injects admission or exact task recovery. Report with
`--binding-token` reserves an Analysis Request. SubagentStart binds only the
requested `stetra-analyzer` identity; child events never admit another task.
SubagentStop ingests only that child's final raw JSON with a minimal native
receipt. It does not read transcripts. Invalid results get at most one format
repair continuation before an explicit fallback. Native receipt proves routing
and event identity, not independent reasoning, semantic truth, or isolation.

Main Stop requests at most one continuation for unchanged unfinished state.
Pending Human choices permit stop. Hooks do not execute Git collection, checks,
or models. Failed native transport can be relayed by the parent through
`assessment submit` with Agent-relayed provenance. Same-context and unavailable
fallbacks remain explicit adoption limitations.

Automated native event fixtures cover both adapters and packed CLI transport.
They are not evidence of a completed live Host/model session. Actual Host trust,
feature support, permission enforcement, and model behavior require native
integration verification for the installed Host version.

Local configuration checks used Codex CLI `0.153.4` and Claude Code `2.1.123`.
Codex's `debug prompt-input` discovered the generated Skill; that diagnostic did
not report even a deliberately malformed Analyzer profile, so it provides no
Analyzer-discovery evidence. Claude's `agents` command listed `stetra-analyzer`.
Both generated Skills passed the skill format validator.

A local Vite lifecycle task subsequently completed the live Codex CLI `0.153.4`
path through collection, Report, native Analyzer ingestion, and a pending
Adoption Package. Its Analyzer identified three omissions after all frozen
checks passed. This is a single usability observation, not comparative product
effectiveness evidence. In that run, the Analyzer inherited writable parent
permissions despite its read-only profile. Isolated write probes reproduced
this with both legacy sandbox settings and permission profiles, including
children spawned without conversation history. Merely changing the custom
agent's permission key did not establish enforcement.
Selecting `:read-only` for the parent analysis turn did: both child write probes
failed with `EROFS`. This verifies that tested Host configuration, not a portable
guarantee that a custom agent can narrow writable parent permissions.

## Persistence and recovery

```text
.stetra/tasks/<taskId>/
  artifacts/<artifact-id-digest>.json
  events/<sequence>.json
  worktree-objects/
  collections/<operationId>/change.patch
  collections/<operationId>/checks/...
.stetra/host-sessions/<host>/<session-digest>/...
.stetra/staging/...
```

Immutable artifacts and collection files publish before the event that commits
them. Ordered event replay reconstructs state without modifying storage; no
redundant projection cache is required. Inspection never repairs state. A
worktree lease serializes collection and baseline publication; task locks and
expected revisions reject concurrent stale writers. Recovery removes only
recognized staging owned by a confirmed dead process and preserves unknown
owner data. Interrupted Begin recovers its exact pending session association
before or after publication, avoiding duplicate admission.

The inspection sections are `summary`, `intent`, `decisions`, `baseline`,
`verification`, `observations`, `observation`, `report`, `analysis`, `assessment`,
`adoption`, `history`, `source`, `patch`, `check`, and `log`. Explicit selectors
choose historical request, Observation, Package, check, or Attempt references.
No transcripts, ordinary Hook events, or cross-task memory are persisted.
