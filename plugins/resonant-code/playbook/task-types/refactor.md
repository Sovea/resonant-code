# Refactor

Use this guidance when improving code structure, clarity, maintainability, or internal design without intentionally changing the externally expected behavior.

Refactor work should make the code easier to understand, evolve, and trust while preserving the intended behavior of the system. The goal is not novelty or architectural ambition, but a better internal shape with controlled risk.

## 1. Preserve intended behavior

A refactor should not change what the code is supposed to do.

- Preserve externally expected behavior unless the task explicitly includes behavior change.
- Treat behavior drift as a refactor failure, not an acceptable side effect.
- Be careful with shared utilities, public interfaces, and implicit contracts.
- Keep semantic changes out of refactor work unless they are explicitly required and clearly separated.

## 2. Improve structure for a real reason

Refactor in response to concrete structural problems, not aesthetic restlessness.

- Improve code to reduce confusion, duplication, fragility, or maintenance cost.
- Make the motivating problem clear in the resulting structure.
- Do not refactor only to make the code look more sophisticated.
- Prefer refactors that remove real friction for future work.

## 3. Keep the scope disciplined

Refactor work should stay tightly bounded by the structural goal.

- Change only what is necessary to achieve the intended improvement.
- Avoid mixing unrelated cleanup, feature work, or speculative redesign into the same refactor.
- Prefer incremental improvement over broad reshaping when both are viable.
- Keep the refactor understandable to reviewers and future maintainers.

## 4. Prefer clarity over abstraction enthusiasm

Refactoring should make the code easier to reason about, not more abstract for its own sake.

- Prefer simpler control flow, clearer naming, and cleaner boundaries.
- Introduce abstractions only when they make the code more coherent or reduce real duplication.
- Do not extract layers, helpers, or generic utilities without clear present value.
- Prefer straightforward structure over theoretically elegant indirection.

## 5. Improve boundaries and responsibilities

Refactor by making responsibilities easier to understand and maintain.

- Separate unrelated concerns when they are entangled.
- Keep interfaces intentional and implementation details local.
- Reduce hidden coupling where it meaningfully improves maintainability.
- Make state, side effects, and domain logic easier to reason about.

## 6. Preserve repository fit

A refactor should still feel native to the surrounding codebase.

- Respect local conventions unless they are the source of the structural problem.
- Do not import a foreign architectural style casually.
- Improve the local area in a way that remains coherent with the repository.
- Prefer steady improvement over stylistic disruption.

## 7. Make the result easier to extend

The value of a refactor is measured partly by what it enables next.

- Leave the code easier to modify for likely adjacent changes.
- Prefer designs that reduce maintenance friction without becoming prematurely generic.
- Make future extension points clearer only where the code shows real pressure.
- Do not pay abstraction cost for hypothetical flexibility alone.

## 8. Keep refactors verifiable

Refactor work should be easy to validate.

Where relevant, include:

- existing tests kept passing
- targeted test additions or updates when structural change affects confidence
- clear separation between mechanical movement and meaningful restructuring
- concise notes when a non-obvious structural decision matters

Do not rely on elegance as proof of correctness.

## 9. Escalate carefully

Some structural problems justify significant reshaping. Most do not.

- Prefer local refactors when the problem is local.
- Escalate to broader structural change only when a smaller refactor would remain confusing, fragile, or repeatedly costly.
- If a larger refactor is necessary, keep the rationale visible in the code and change shape.
- Do not use refactor work as cover for an opportunistic rewrite.

## 10. Review refactor quality by clarity, coherence, and safety

A refactor is good when the code becomes easier to work with without becoming riskier or more foreign.

Judge refactor quality by whether it is:

- behavior-preserving
- clearer to read and reason about
- better bounded in responsibility
- lower in structural friction
- proportional in scope
- consistent with the surrounding codebase

## Core preference

When multiple refactor approaches are valid, prefer the one that best preserves:

1. behavioral stability
2. clarity
3. coherent boundaries
4. proportional change
5. long-term maintainability

Prefer refactors that make the code meaningfully simpler and easier to evolve, rather than refactors that mainly make it look more architected.
