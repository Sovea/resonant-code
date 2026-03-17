---
name: review
description: "Guide code review so the feedback aligns with best practices, clear specifications, and especially the user's personal coding style and taste. Use when reviewing code, proposed changes, or existing implementations."
metadata:
  version: "0.0.1"
  author: "Sovea"
---

# Resonant Review

Review code guided by a structured playbook of coding specifications so the feedback aligns with best practices, clear engineering standards, and especially the user's personal coding style and taste.

Use the shared playbook resolution guidance from `_shared/playbook-resolution.md` to locate, interpret, and apply playbook rules before reviewing code.

## 1. Task Framing

Before reviewing code, identify what kind of review is actually needed. The review framing determines which playbook sections matter most and what kinds of issues should be prioritized.

Common review contexts include:

- **Feature review**: evaluate whether a new implementation is correct, maintainable, and consistent with the existing codebase
- **Bugfix review**: check whether the fix addresses the root cause, keeps the change surface appropriately small, and avoids regressions
- **Refactor review**: verify that structure and maintainability improve without changing intended external behavior
- **Migration review**: examine compatibility, safety, consistency, and incremental adoption risks when code is moved across APIs, versions, or patterns
- **Follow-up review**: review changes made in response to earlier feedback and confirm whether the important issues were actually resolved

Also determine the review scope before commenting:

- whether the review is for **new code**, **modified existing code**, or **an entire implementation**
- whether the review should focus on **correctness**, **maintainability**, **consistency**, **risk**, or overall code quality
- which **language**, **framework**, **task type**, and **domain** are relevant
- whether strong repository-local conventions should carry significant weight

Prefer the narrowest correct framing. Do not review a local fix as though it were a ground-up redesign. Do not treat a prototype as production infrastructure unless the task clearly demands that standard.

## 2. Resolve Playbook

Before reviewing, resolve the applicable playbook guidance using `_shared/playbook-resolution.md`.

Apply that shared resolution process to:

1. find the relevant playbook source
2. identify the relevant sections
3. get final single working interpretation for the current task

Use the resolved playbook guidance to decide:

- what standards the code should reasonably satisfy
- which issues are truly important versus merely different
- when local consistency should outweigh abstract preference
- when a change is under-structured versus overengineered
- whether the code fits the task, repository, and domain rather than only matching generic best practices

Do not quote the playbook back mechanically. Use it to sharpen judgment.

If the repository's established local style clearly conflicts with broader playbook guidance, prefer local consistency unless it preserves a serious problem in correctness, maintainability, readability, safety, or long-term engineering quality.

## 3. Output Contract

Produce review feedback that is prioritized, specific, and actionable.

### Default review behavior

- Prioritize high-impact issues over style noise
- Focus on the most important problems first
- Keep feedback concise, but not vague
- Explain why something matters when the reason is not obvious
- Prefer comments that help improve the code over comments that merely display taste

### Severity and prioritization

When possible, organize findings by importance:

- **Blocker**: likely correctness issue, serious regression risk, unsafe behavior, or a change that should not land as written
- **Major**: important maintainability, design, or consistency issue that materially weakens the implementation
- **Minor**: worthwhile improvement, but not something that fundamentally blocks adoption
- **Nit**: small polish issue with low impact

Do not inflate severity just to sound strict. Do not bury important issues under a long list of nits.

### What good review feedback should do

Good feedback should:

- identify the issue clearly
- explain why it matters
- connect the issue to the task, codebase, or playbook intent
- suggest a concrete direction for improvement when useful
- distinguish between required changes and optional refinements

When there are no meaningful issues, say so clearly instead of inventing weak criticism.

### Review focus

By default, prioritize review comments around:

- correctness
- clarity
- maintainability
- local consistency
- appropriate abstraction level
- boundary handling, state handling, side effects, and error handling where relevant
- fit with the repository, framework, and domain context

Review style and taste, but do so with restraint. Prefer commenting on style only when it affects readability, consistency, API quality, or long-term maintainability.

### What to avoid

- noisy reviews dominated by personal preference
- generic best-practice commentary disconnected from the task
- suggestions that require broad rewrites without clear justification
- mechanically enforcing playbook rules where they do not fit the repository reality
- over-praising trivial code
- inventing issues just to make the review look thorough

The final review should feel like strong engineering judgment applied with taste and proportionality, not a checklist dump.
