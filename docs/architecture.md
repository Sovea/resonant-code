# Architecture

This document defines the adopted target design for Stetra's Decision-aware
Agent-native Adoption Runtime. The product owner has chosen to proceed without
a prerequisite experiment or paired effectiveness study.

The current implementation remains the schema `2` workflow documented in
[Change workflow](change-workflow.md). Runtime Decisions, separate semantic
Assessments, and Reconciliation below are target behavior, not implemented
capabilities. Product direction, executable behavior, and measured product
effectiveness must remain distinguishable.

## Product positioning

Stetra helps developers delegate implementation while retaining engineering
understanding and authority over new choices and adoption. It enters the Coding
Agent's work loop through project initialization, Skills, Hooks, and Host-native
extensions.

Codex, Claude Code, Pi, Trellis, and similar systems remain the interaction and
execution Hosts. They own models, conversation, investigation, planning,
implementation, tools, sessions, subagents, worktrees, cancellation, and
streaming. Stetra does not replace their entry point or run a second Coding
Agent loop.

| Developer right | Product obligation |
|---|---|
| Direction | Keep the exact request and subsequent corrections effective during work. |
| Visibility | Expose actual changes, verification, important choices, and uncertainty. |
| Intervention | Present a concrete choice when continuing needs new Human authority. |
| Understanding | Explain behavior, mechanism, ownership, invariants, and failure paths against current code. |
| Adoption | Bind explicit acceptance to the exact current result and its disclosed limitations. |

The central loop connects declared Decisions to assessed system changes and
Runtime Observations. Reconciliation surfaces unexplained changes, conflicting
claims, departures from developer direction, and missing evidence so they can
be investigated, corrected, or explicitly decided.

## Product kernel

One admitted task contains five domain concepts:

| Concept | Responsibility |
|---|---|
| **Intent** | Exact Human direction, compact Agent interpretation, protected constraints, and the current authorization boundary. |
| **Decision** | An engineering choice discovered before or during implementation, its alternatives and consequences, and the authority for its resolution. |
| **Observation** | Runtime-observed baseline, actual changes, Check Attempts, execution inputs, and fact currency. |
| **Assessment** | Attributed semantic judgments about actual behavior changes, decision implications, evidence, and uncertainty. |
| **Adoption** | The later Human decision about one exact current result, including its Assessments and unresolved findings. |

Evidence references connect Assessment claims to Observations and inspectable
code. They do not require a separate obligation graph. These concepts do not
imply five stores, services, or independently orchestrated workflows.

## Visible workflow

The developer continues to see ordinary engineering phases:

```text
Align -> Work -> Decide
```

The target task loop is:

```text
exact Human request -> Intent + baseline
  -> Agent investigation and implementation
       -> Decision proposal -> existing authority or Human resolution
       -> Human correction -> revised current Intent
  -> current Observations
  -> implementation report + semantic Assessment
  -> Reconciliation
       -> explanation, investigation, repair, or a necessary Human choice
  -> current Adoption Package
  -> Human adoption decision
```

Ordinary implementation stays autonomous within existing authority. Important
choices do not all require approval. Routine changes need no invented
Decisions, mandatory diagnosis, Conditions, or Evidence Obligations.

## Admission and authority

Stetra creates task state only for an admitted coding task. Conversation-only
work and declined tasks create no task and capture no prompt. Admission comes
from an exact Human choice or explicit project policy: `explicit`, `ask`, or
`required`. Runtime does not infer admission, assurance, or semantic importance
from paths, dependencies, keywords, diff size, or counts.

| Actor | Owns | Does not own |
|---|---|---|
| Developer | Exact requests and corrections, outcomes, constraints, authorization, long-lived choices, exceptions, external effects, admission, and adoption | Runtime observations or Agent analysis |
| Coding Agent | Interpretation, investigation, design, implementation, Decision proposals, repair, implementation reports, and recommendations | Human authority or machine facts |
| Analyzer | Semantic Assessments, candidate omissions and contradictions, uncertainty, and evidence-directed review questions | Semantic truth, Human authority, or adoption |
| Runtime | Identity, ordering, current bindings, Observations, persistence, reference validation, and deterministic structural policy | Natural-language truth, engineering causes, or implementation strategy |
| Trusted Host | Execution capabilities and event identity it actually controls | Semantic truth or authority it cannot attest |

Analyzer is a semantic role, not a new authority class. Its output remains
Agent judgment, even when produced in an isolated context or by another model.
Runtime does not own semantic truth; Stetra nevertheless provides semantic
assessment as an explicit product capability.

The Human source of a constraint remains separate from the Agent's
interpretation and application of it. Runtime can apply a policy to an explicit
reference; it cannot prove that a natural-language change falls within that
policy. Thin adapters label relayed Human text as unattested rather than
manufacturing Host provenance. Green checks cannot become adoption, and a Human
exception cannot erase contradictory facts.

## Intent and in-work correction

Intent preserves the exact admitted request beside the Agent's compact
interpretation. Existing authorization remains effective; the Agent must not
ask again merely because a choice is important or Stetra stores it.

A later Human correction can update the current task while work is underway.
It preserves the original request, previous interpretations, Decisions, and
Observations. The original Git baseline is not replaced. Previous delivery
explanations remain historical when the effective Intent changes.

Changes to developer-owned outcomes, constraints, and acceptance criteria need
Human authority. Additional investigation, implementation choices, and checks
within the authorized task remain Agent work. Previously executed Check
definitions and outcomes are immutable; a changed verification plan preserves
their identity and the reason for the new plan.

## Decisions during implementation

A Decision represents a concrete engineering fork. The Agent explains the
problem, viable alternatives, proposed choice, consequences, and applicable
authority. It records an important autonomous choice or requests a Human
resolution when existing authority is insufficient.

Runtime preserves proposals and resolutions, their ordering, and their basis
in current Intent. Human resolution binds the exact developer response to the
proposal being resolved. A changed proposal cannot reuse approval of an older
choice. The Agent does not relabel its own selection as Human authorization.

Pending Human choices identify the work that depends on them. Investigation
and unrelated authorized work may continue. A completion checkpoint cannot
silently treat an unresolved choice as approved.

Absence of a Decision record does not establish absence of authorization.
Reconciliation checks the request, corrections, policy, and Decisions together.
A retrospective explanation of code is not evidence of the implementer's
historical motive or of an earlier Human decision.

## Observations and evidence

Runtime records facts needed to understand, recover, review, or adopt a change:

- complete dirty and non-ignored untracked Git baseline;
- actual file operations, modes, digests, representable patches, and binary or
  unrepresentable markers;
- exact argv Check definitions and ordered execution Attempts;
- exits, signals, timeouts, spawn failures, bounded logs, and full-stream digests;
- declared execution inputs and pre-check, post-check, and check-induced changes;
- declared verifier-surface mutations and current-worktree currency.

Checks run without a shell. Passing checks establish observed outcomes, not
semantic coverage or acceptability. Declared verifier selectors establish only
their stated coverage. Failed and superseded observations remain inspectable.
Routine tasks do not require baseline check execution.

Reuse existing Git, process, log, and currency infrastructure where its
behavior remains useful. Simplifying the domain does not justify dropping
adverse evidence or substituting an Agent report for a Runtime Check Attempt.

## Semantic Assessment

The implementation report explains the Coding Agent's actual change and its
reported Decisions. A semantic Analyzer examines current Intent, Observations,
and relevant repository context to assess the implementation's behavior. Its
Assessment is submitted separately from the implementation report.

An Assessment reconstructs the material before/after model: behavior,
mechanism, state and resource ownership, invariants, failure and recovery,
tradeoffs, and unknowns. Claims include inspectable references where available.
The Analyzer can identify omissions and contradictions and request concrete
follow-up; its conclusions remain contestable judgments.

Analysis executes through the Host. Core and CLI do not call an LLM. Runtime
provides bounded current inputs, accepts attributed results, and validates
bindings. The Host owns model invocation, tool access, isolation, and any
subagent execution. This does not create a Stetra model router or Agent loop.

The reference integration supports a separate analysis context. Portable use
can provide an explicitly labelled same-context Assessment or disclose that
analysis was unavailable. A fallback must not impersonate independent review.
Claims about isolation and execution are limited to what the Host can attest;
an Agent-supplied label alone is not attestation.

Assessment inputs are bound to effective Intent, Decision state, current
Observations, and supplied analysis material. Relevant changes during analysis
invalidate its use in a current Adoption Package. A failed Analyzer produces
an explicit gap and bounded recovery, not an endless continuation loop.

## Reconciliation

Reconciliation connects the implementation report, Decisions, semantic
Assessments, and Observations. Semantic matching is Agent judgment. Runtime
validates references, current bindings, unresolved states, and explicit
dispositions; it does not infer natural-language correspondence.

| Finding | Engineering response |
|---|---|
| An actual change is insufficiently explained | Add an evidence-linked explanation and maintenance entry point. |
| A change conflicts with current developer direction | Repair it or present the concrete choice needing new authority. |
| An explanation conflicts with code or observed checks | Correct the claim, repair the implementation, or obtain missing evidence. |
| A suspected effect lacks adequate evidence | Investigate or disclose the bounded uncertainty. |

Each material finding retains its source, evidence, consequence, and explicit
disposition. A disagreement is not erased by the implementation Agent calling
it resolved. Updated explanations and counterevidence remain inspectable.
Human acknowledgment can authorize adoption with a disclosed limitation; it
does not turn a disputed Assessment into a Runtime fact.

Decision coverage is a readable relation between assessed changes and their
explanation or authority, not a percentage or a claim that every important
change has been detected. Do not introduce scalar trust, confidence, risk,
readiness, or quality scores.

## Adoption Package and Human decision

The Adoption Package is a rebuildable developer view of one exact current
result. It presents:

- intended and actual behavior;
- important Decisions and their authority;
- mental-model changes needed to understand and maintain the result;
- Runtime verification and its limits;
- semantic findings, disagreements, dispositions, and residual unknowns;
- focused review entry points and the Agent's recommendation;
- the exact pending Human choice.

The view distinguishes delivery, observed verification, semantic assessment,
recommendation, and Human adoption. Structural completion does not establish
that the implementation or explanation is correct. Patches, logs, references,
and history remain available through bounded inspection.

Adoption remains an exact later Human Event bound to current Intent,
Decisions, Observations, Assessments, and the presented Package. Acceptance
with unresolved findings requires explicit acknowledgment. Correction,
rejection, and deferral remain available. Edits or changed task authority
invalidate an old Package's use for a new adoption decision without erasing
history.

Adoption does not commit, merge, publish, deploy, approve unrelated choices,
or create project policy. Cross-task cognitive state and decision memory are
outside this redesign.

## Host integration and Agent surface

The dependency direction remains:

```text
Generated Host Adapter -> CLI Runtime -> Core
```

Skills explain when and why to propose a Decision, preserve a correction,
collect Observations, obtain an Assessment, and present adoption. The CLI is
the local executable API; the developer keeps using the Host's conversation.
The Agent never authors canonical fingerprints, persistence schemas, or
Runtime recovery projections.

Codex is the first supported Host for the target architecture and the reference
integration for its analysis and lifecycle flow. Complete and verify the target
loop in Codex first. Claude Code may be included in the same implementation
effort as a second Host; its support and feature parity do not gate Codex
delivery.

Keep domain meaning portable while mapping each adapter to its actual native
capabilities. Adapter capabilities are specific to installed supported behavior;
support does not mean identical enforcement or isolation across Hosts. Derive
the Codex integration from Codex's own contracts rather than assuming another
Host's event names or control behavior apply.

Hooks serve context recovery, invalidation, bounded adoption continuation, and
specific enforceable controls for pending Human choices. Host Stop and task
completion events must not be treated as interchangeable. Repeated unchanged
state permits stopping with a visible gap. Hooks create neither task admission
nor Human authority, and they do not persist every tool call.

Retain initialization's ownership manifest, marked blocks, JSON fragments,
drift detection, and protection of unknown owner data. Plan writes before
mutation. Host files are generated projections, not the domain source of truth.

## Persistence and package boundary

Task artifacts remain under `.stetra/tasks/<taskId>/`. Persist admitted Human
events, Intent revisions, Decision proposals and resolutions, Observations,
implementation reports, Assessments and finding dispositions, and adoption
records only when they serve the current task's control or handoff.

Artifacts preserve history through immutable records and supersession. Task
projection and the developer Package are rebuildable. Operational Host session
bindings support exact recovery, not cross-task knowledge. Do not persist
transcripts, hidden reasoning, Drafts, Guides, ordinary Hook events, or
unchanged duplicate collections.

`@sovea/stetra-core` continues to own deterministic domain validation and
transitions. `@sovea/stetra` owns IO, Git and Check collection, storage,
sequencing, presentation, initialization, and Host integration. Core does not
read repositories, execute commands, format CLI output, know Host files, or
call an LLM. Exact schemas live in TypeScript.

The current two Core runtime exports do not constrain the target kernel.
The product owner requested initial versions for the fresh implementation:
paired package version `0.0.1` and protocol schema `1`. Do not add legacy
compatibility, format recognition, migration, aliases, or dual read/write paths.

## Implementation sequence

The [implementation plan](implementation-plan.md) specifies the proposed schema,
Core API, CLI operations, persistence changes, Codex adapter, and engineering
acceptance criteria. It does not describe currently executable behavior.

Implementation proceeds directly from this adopted design:

1. Replace the domain contract with Intent, in-work Decisions and corrections,
   Observations, Assessments, and Adoption, preserving authority boundaries.
2. Implement task storage and current-state projection, including proposal
   resolution, supersession, stale inputs, and interrupted-operation recovery.
3. Connect existing Git and Check infrastructure to the new Observation path.
4. Implement separate report and Assessment submission, Reconciliation
   dispositions, current Adoption Packages, and Human adoption binding.
5. Integrate Codex's analysis and lifecycle flow first, with honest portable
   fallback and owner-safe initialization. Claude Code can be implemented
   alongside it as a second adapter without delaying the Codex path.
6. Complete behavior, failure/recovery, distribution, and generated-adapter
   checks, including the Codex path and any included Claude Code path; update
   executable workflow documentation alongside the code.

Do not require a prototype, user study, paired experiment, or measured
comparison before implementing these capabilities. Engineering verification
remains required. Later effectiveness evaluation can test adoption cost,
understanding, decision surprises, and unnecessary interruptions. Such claims
remain unverified until supported by the applicable evaluation protocol and a
Human product-owner conclusion.

## Anti-goals

Stetra is not a Coding Agent, generic planner, workflow engine, model SDK,
multi-Agent orchestrator, trace platform, repository wiki, prompt library,
automatic approver, deployment tool, or cross-task knowledge system. Do not
restore nested Evidence Obligations or build a general assurance-plugin
framework as part of the kernel redesign.
