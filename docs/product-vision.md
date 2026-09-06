# Product vision

## The problem

Coding Agents can investigate and implement changes faster than a developer can
reconstruct what they actually did. The developer is often left with a diff,
green checks, and an Agent completion story, but not a reliable understanding
of changed behavior, ownership, invariants, failure paths, or evidence gaps.

The resulting control gap is:

```text
developer request
  -> rapid Agent implementation
  -> persuasive completion summary
  -> adoption without an equally rapid recovery of engineering understanding
```

The implementation can be correct while the developer loses the ability to
explain or maintain it. It can also pass self-modified verification, solve a
symptom instead of an invariant, or leave unsupported compatibility and
recovery claims hidden in prose.

## Product thesis

Stetra lets developers delegate implementation without delegating away
engineering understanding, authority over new choices, or adoption authority.
Its adopted target is a Decision-aware Agent-native Adoption Runtime.

It binds:

```text
what the developer authorized
  -> which engineering choices arose during implementation
  -> what the Runtime observed
  -> what the implementer reports and the Analyzer assesses
  -> how actual changes, explanations, evidence, and authority reconcile
  -> what remains unsupported or unknown
  -> what the developer decides
```

Stetra is a task-scoped project layer embedded in existing Coding Agent Hosts.
It does not replace their conversation, planning, execution, tools, or
subagents.

The product owner has chosen to proceed with this direction without a
prerequisite experiment. [Architecture](architecture.md) defines the domain.
[Change workflow](change-workflow.md) describes the schema `1` implementation
of runtime Decisions, separate semantic Assessments, and Reconciliation.
Implementation and deterministic tests do not establish product effectiveness.

## Primary job

For one admitted Agent-authored change, help the developer answer:

1. Did the implementation remain connected to my request and corrections?
2. Which important choices arose, and did any need new authority from me?
3. What behavior, mechanism, ownership, and failure paths actually changed?
4. Did the implementation report omit or misdescribe an important change?
5. What verification ran, and what remains unsupported, disputed, or unknown?
6. Where will direct review most affect understanding and adoption?
7. Do I accept, request correction, reject, or defer this exact result?

Everything Stetra persists or asks the Agent to author must change one of those
answers.

## Product experience

The developer continues to talk naturally to Codex, Claude Code, Pi, or another
Host. Stetra creates no state for ordinary conversation. A coding task enters
Stetra only through an explicit developer choice or project admission policy.

The target experience keeps the visible workflow:

```text
Align
  Preserve exact direction, compact interpretation, and existing authority.

Work
  Implement through the Host. Surface choices needing new Human authority,
  record important autonomous choices, and keep Human corrections effective.

Decide
  Observe the actual result, obtain a separate semantic Assessment, reconcile
  material differences, and present an understandable current Adoption Package.
```

Routine work stays close to ordinary Agent use. Consequential assurance appears
only because of an explicit Human choice or project policy. Adverse facts
produce concrete Attention, not an inferred assurance mode. Important choices
do not all need approval; existing authority remains effective. Stetra never
assigns scalar trust, readiness, confidence, complexity, risk, or quality scores.

## Durable differentiation

The central target capability is Reconciliation: connect assessed system
changes to the implementation report, developer direction, reported Decisions,
and observed evidence. Surface omissions, contradictions, and unresolved choices
with a concrete engineering consequence and an inspectable review entry point.

An Analyzer supplies a separately attributed Assessment; it does not acquire
semantic truth or Human authority. An isolated context does not guarantee
correctness, and a same-context fallback cannot impersonate independent review.
The developer can challenge the interpretation and inspect its evidence.

Runtime provides the factual foundation:

- bind an exact Human request to a pre-change Git baseline;
- freeze and execute exact argv checks without a shell;
- preserve failed, timed-out, and superseded observations;
- detect check-induced and verifier-surface changes;
- reject a Handoff built on stale facts;
- keep Runtime facts separate from Agent judgment;
- bind Human adoption to one exact current Handoff and Fact Collection.

The intended result is a lower-cost Human control loop over Agent work. A
strong Markdown Skill and Trellis-style finish flow remain useful comparison
baselines for later evaluation; development does not wait for that comparison.

## Relationship to Trellis and execution harnesses

Execution harnesses may own repository context, project specs, task planning,
model selection, subagents, implementation, tests, and repair.

```text
Coding Agent / Trellis / execution Host
  investigate -> plan -> implement -> test -> repair

Stetra
  preserve Intent -> support Decisions -> observe facts -> assess changes
  -> reconcile explanations and authority -> support Human adoption
```

Stetra must compose with those systems. It should be possible to admit a task
after another harness finishes planning and to use the Stetra Decision Brief
inside that harness's finish flow without changing Core.

Core and CLI do not invoke models. Hosts supply analysis execution and native
lifecycle capabilities. Adoption does not commit, merge, publish, deploy, or
automatically create long-lived project policy. Cross-task cognitive state and
decision memory remain outside this redesign.

Codex is the first Host for the target product and its reference integration.
Claude Code may be included alongside it as a second Host. The initial delivery
prioritizes the complete Codex loop; shared domain semantics do not require
identical Host capabilities or simultaneous delivery.

## North Star

> More Agent-authored production changes confidently adopted per active
> developer hour, without degrading implementation outcomes, developer
> understanding, evidence honesty, or Human authority.

The success criteria remain separate rather than collapsing into a score:

- implementation outcome;
- task and Agent overhead;
- time to a confident adoption decision;
- correctness of behavior, invariant, ownership, and failure-path
  understanding;
- useful correction rounds;
- unexpected material decisions discovered during review;
- useful and incorrect semantic findings, including missed changes;
- unnecessary interruptions;
- evidence integrity;
- explicit adoption result.

## Engineering and evidence status

Implement the adopted architecture directly, with behavior tests, failure and
recovery coverage, package verification, and generated-adapter checks. No
prototype, user study, paired experiment, or measured comparison is a
prerequisite for the redesign.

Product effectiveness is unverified. Unit tests, type checks, package builds,
and black-box CLI tests establish engineering integrity and usability
prerequisites, not adoption value.

When evaluating measured effectiveness, the comparison sequence remains:

1. packed-package black-box usability with natural task prompts;
2. paired comparison with an ordinary Agent and strong Handoff Skill;
3. paired comparison with a Trellis-style managed task;
4. composition of Trellis plus Stetra;
5. only then, explicit product-owner acceptance of a scoped claim.

The paired protocol governs effectiveness claims, not permission to implement
Decisions, Assessments, Reconciliation, or Host integration. Later findings can
inform iteration without turning protocol completion or a confident developer
response into proof of correct understanding. Decision coverage describes links
for assessed changes; it does not prove that all material changes were found.

## The product in one sentence

> Stetra keeps the engineering control loop between developer intent and the
> actual Agent-authored change intact, so the result can be understood,
> challenged, and explicitly owned by the developer.
