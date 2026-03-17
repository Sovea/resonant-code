# Feature

Use this guidance when implementing new functionality or materially extending existing behavior.

Feature work should deliver the requested capability in a way that is correct, maintainable, and well-fitted to the existing codebase. The goal is not just to make the feature work, but to make it belong.

## 1. Start from the requested behavior

Implement the feature around the actual behavior the user or product needs.

- Clarify the expected behavior before introducing structure.
- Optimize for solving the real task, not for showcasing architecture.
- Keep the implementation centered on user-visible or system-relevant outcomes.
- Do not add speculative flexibility unless the feature clearly requires it.

## 2. Fit the existing system

Make the feature feel native to the repository.

- Follow local naming, structural, and architectural conventions unless there is a strong reason not to.
- Reuse existing patterns when they are sound and appropriate.
- Avoid introducing a new abstraction style or subsystem shape casually.
- Extend the current system in a way that keeps the surrounding code coherent.

## 3. Add only the structure the feature earns

Give the implementation enough structure to remain clear and maintainable, but no more.

- Prefer straightforward implementations when the feature is small or well-bounded.
- Introduce helpers, modules, or abstractions only when they improve clarity, reuse, or separation of concerns in a meaningful way.
- Avoid over-designing for possible future variants that do not yet exist.
- Let complexity grow with real product or technical pressure.

## 4. Keep responsibilities clear

Organize the feature so that behavior, state, side effects, and boundaries remain understandable.

- Keep unrelated concerns separated.
- Keep domain logic distinct from transport, rendering, persistence, or framework glue where that distinction matters.
- Make data flow and control flow easy to follow.
- Keep public interfaces intentional and implementation details local.

## 5. Be careful at boundaries

Feature work often touches external inputs, state transitions, and side effects. Handle them deliberately.

- Treat external or uncertain data carefully.
- Make assumptions visible in code rather than implicit.
- Handle failure modes, invalid states, and edge cases in proportion to the feature's importance and risk.
- Do not let happy-path implementation hide boundary fragility.

## 6. Preserve change proportionality

Even when implementing something new, keep the scope proportionate to the requested feature.

- Do not rewrite unrelated areas to make the design feel cleaner.
- Avoid bundling opportunistic refactors into feature delivery unless they are necessary to implement the feature safely.
- Prefer incremental extension over sweeping reorganization when both are viable.
- Keep the change surface understandable to future reviewers and maintainers.

## 7. Make the result easy to evolve

A feature implementation should not trap the codebase in a brittle local maximum.

- Choose names, interfaces, and boundaries that can support near-term evolution without becoming vague.
- Prefer designs that are easy to extend intentionally over designs that are prematurely generalized.
- Leave the code in a state where a future engineer can add the next adjacent behavior without confusion.
- Do not pay for abstract flexibility before there is real evidence that it is needed.

## 8. Include the supporting work the feature meaningfully needs

Feature work is not complete if critical supporting concerns are ignored.

Where relevant, include:

- necessary validation or guardrails
- test coverage or test updates for meaningful behavior
- state handling and error handling appropriate to the feature
- concise notes about important assumptions, constraints, or follow-up work

Do not add ceremony for its own sake, but do not treat the visible implementation alone as the whole feature.

## 9. Review feature quality by fitness, not just completion

A feature is not successful merely because it works once.

Judge feature quality by whether it is:

- correct
- clear
- locally consistent
- proportional in scope
- maintainable in the surrounding codebase
- appropriately structured for likely near-term change

## Core preference

When multiple feature implementations are valid, prefer the one that best preserves:

1. correctness
2. clarity
3. repository fit
4. proportional structure
5. maintainability over time

Prefer code that makes the new capability feel naturally integrated into the system, rather than code that solves the feature in isolation.
