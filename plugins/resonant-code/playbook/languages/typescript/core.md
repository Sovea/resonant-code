# TypeScript

Use TypeScript to improve clarity, correctness, and maintainability. Favor direct, honest, and conventional typing over clever type-level programming.

## 1. Use TypeScript to clarify intent

Use types to make APIs, data flow, and expectations easier to understand.

- Prefer types that communicate intent clearly to readers and maintainers.
- Let types improve correctness and readability, not just compiler satisfaction.
- Prefer direct, explainable typing over impressive type machinery.
- Choose the simplest type design that fully supports the task.

## 2. Keep public interfaces explicit

Make exported and shared interfaces easy to understand and stable to use.

- Keep function inputs, return values, component props, and shared contracts explicit.
- Prefer public types that are intentional, readable, and stable.
- Do not leak internal implementation detail into exported types.
- Design interfaces around real usage, not hypothetical flexibility.

## 3. Keep types honest and precise

Types should reflect runtime reality as closely as practical.

- Avoid `any` except at unavoidable boundaries or deliberate escape hatches.
- Prefer narrowing and modeling over assertion.
- Use type assertions sparingly and only when the runtime reality is already established.
- Model nullability, optionality, and variant states explicitly.
- Avoid overly broad types that hide real behavior or valid failure modes.

## 4. Prefer simple type modeling

Favor straightforward type shapes over unnecessary abstraction.

- Prefer object types, unions, literals, and simple generics when they clearly express the model.
- Introduce shared types only when the shared concept is real and recurring.
- Do not abstract type patterns too early.
- Avoid type-level cleverness that makes maintenance harder than the underlying code.

## 5. Respect runtime boundaries

Static typing does not remove the need for runtime care.

- Treat network data, storage data, user input, environment input, and third-party values as untrusted until validated or narrowed.
- Do not use TypeScript types as a substitute for runtime validation at boundaries.
- Do not pretend uncertain values are safe through assertion alone.
- Move from uncertain external data to trusted internal data through explicit checks, validation, or narrowing.

## 6. Prefer conventional, maintainable TypeScript style

Choose TypeScript patterns that strong teams can read, maintain, and evolve comfortably.

- Favor common and legible TypeScript idioms.
- Avoid overly complex utility-type compositions unless they provide clear practical value.
- Use advanced generic or conditional typing only when it materially improves correctness or API quality.
- Prefer maintainability over type sophistication.

## Core preference

When multiple TypeScript approaches are valid, prefer the one that best preserves:

1. correctness
2. clarity
3. interface quality
4. local consistency
5. long-term maintainability