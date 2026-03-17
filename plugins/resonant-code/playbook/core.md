# Core

Apply these principles across languages, frameworks, task types, and domains. Use them as the default foundation for implementation and review unless more specific guidance clearly refines them.

## 1. Prefer simplicity over cleverness

Choose the simplest solution that fully satisfies the task.

- Do not introduce abstraction without clear present value.
- Avoid cleverness that reduces readability, predictability, or maintainability.
- Prefer direct implementations over layered designs that the task has not earned.
- Let complexity appear only where the problem truly requires it.

## 2. Prefer clarity and legibility

Write code that is easy for another engineer to understand locally and confidently extend later.

- Prefer explicit and legible code over compressed or overly indirect code.
- Make naming, control flow, and responsibilities easy to follow.
- Keep important behavior visible rather than hidden behind unnecessary indirection.
- Use comments to explain intent, assumptions, or non-obvious trade-offs, not to restate the code.

## 3. Preserve local consistency

Prefer consistency with the surrounding codebase over abstract idealization.

- Match local naming, structural, and organizational conventions unless there is a strong reason not to.
- Do not introduce a foreign style, abstraction model, or architectural pattern casually.
- Improve code in ways that still make it feel native to the repository.
- Prefer repository fit over generic best-practice performance when the difference is not meaningful.

## 4. Make the smallest reasonable change

When modifying existing code, solve the task with the narrowest change that fully addresses the problem.

- Avoid unrelated rewrites, renames, moves, or cleanup.
- Preserve stability outside the intended change surface.
- Prefer targeted and reversible changes over broad restructuring.
- Do not expand scope just to make the result look cleaner in isolation.

## 5. Keep boundaries and responsibilities clear

Make code easier to reason about by keeping concerns separated and interfaces intentional.

- Do not mix unrelated responsibilities in the same unit of code.
- Keep public interfaces stable, deliberate, and easy to understand.
- Keep implementation details local where possible.
- Place side effects near boundaries and keep core logic understandable.

## 6. Let abstraction follow real pressure

Abstract only when there is a real, coherent concept or repeated pressure that justifies it.

- Do not generalize for hypothetical reuse alone.
- Extract shared logic only when the shared behavior is real and stable.
- Prefer duplication over the wrong abstraction when the correct abstraction is not yet clear.
- Make abstractions serve the domain and the codebase, not aesthetic neatness alone.

## 7. Prefer correctness and clarity before optimization

Treat correctness as non-negotiable and optimization as something that should be justified.

- Prefer correctness and clarity before performance tuning.
- Do not optimize prematurely without evidence or clear need.
- Handle assumptions, failure modes, and edge cases with care.
- Be careful at boundaries, state transitions, and side-effectful operations.

## 8. Apply judgment, not checklist compliance

Use these principles to sharpen engineering judgment, not to force mechanical conformity.

- Apply the intent of a rule, not just its wording.
- When guidance conflicts, prefer the interpretation that best preserves correctness, clarity, local consistency, and minimal unnecessary change.
- Do not force principles in ways that produce awkward or unnatural code.
- The final result should feel well-judged, proportional, and appropriate to the task and repository.

## Core preference

When multiple valid solutions exist, prefer the one that feels most:

1. correct
2. clear
3. locally consistent
4. proportionate to the task
5. maintainable over time

Prefer code that reflects sound engineering judgment and restrained taste over code that is merely impressive, fashionable, or technically elaborate.
