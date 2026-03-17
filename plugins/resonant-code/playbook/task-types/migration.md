# Migration

Use this guidance when moving code, behavior, or interfaces across APIs, libraries, framework versions, architectural patterns, or system boundaries.

Migration work should move the codebase from one valid state to another with safety, clarity, and controlled change. The goal is not just to reach the target state, but to do so in a way that limits risk, preserves understanding, and keeps adoption manageable.

## 1. Optimize for safe transition

Treat migration as transition work, not just end-state work.

- Prefer migration strategies that keep the system understandable and stable during the transition.
- Do not optimize only for the final architecture if doing so makes the path fragile.
- Preserve operational safety, reviewability, and reversibility where practical.
- Favor moves that reduce migration risk even when they are less theoretically clean.

## 2. Be explicit about source and target states

A good migration makes both the old world and the new world legible.

- Make the current pattern, target pattern, and change boundary clear.
- Do not mix multiple migration goals into one indistinct rewrite.
- Keep compatibility assumptions visible.
- Make it easy to see what is being replaced, what is being introduced, and what remains temporary.

## 3. Prefer incremental change when viable

Most migrations are safer when broken into understandable steps.

- Prefer staged migration over sweeping replacement when both are viable.
- Keep steps small enough to review, validate, and recover from.
- Avoid bundling unrelated modernization into the same migration.
- Preserve working intermediate states whenever practical.

## 4. Control compatibility and breakage

Migration quality depends on how carefully compatibility is handled.

- Be explicit about whether compatibility must be preserved, partially preserved, or intentionally broken.
- Avoid accidental interface drift.
- Keep public contracts stable until the migration explicitly changes them.
- If breaking changes are necessary, keep them deliberate, visible, and tightly scoped.

## 5. Keep temporary structures intentional

Migration often requires adapters, shims, wrappers, or transitional duplication. Use them deliberately.

- Introduce temporary structures only when they materially improve safety or transition clarity.
- Mark transitional code by structure and intent, not by ambiguity.
- Do not let migration scaffolding become indistinguishable from permanent design.
- Remove or isolate temporary layers when their purpose is complete.

## 6. Preserve repository coherence

Even transitional code should still feel native to the repository.

- Match local conventions unless the migration specifically exists to replace them.
- Do not import a foreign architecture or style more broadly than the migration requires.
- Keep the surrounding code understandable during the transition.
- Prefer migration patterns that fit the codebase's existing operational reality.

## 7. Make the migration easy to verify

Migration work should be validated at each meaningful step.

Where relevant, include:

- checks or tests that prove source behavior still works where compatibility is expected
- checks or tests that prove target behavior works as intended
- validation around adapters, boundary transformations, or data shape changes
- concise notes about transitional assumptions, limits, or removal conditions

Do not assume architectural intent is proof of migration correctness.

## 8. Separate migration from redesign

Migration may expose deeper design problems, but migration work should stay focused.

- Do not use migration as cover for an opportunistic rewrite unless that rewrite is truly required.
- Distinguish required transition changes from optional structural improvement.
- Prefer completing the migration cleanly over widening scope into general redesign.
- If broader redesign is necessary, keep it explicitly justified by migration constraints.

## 9. Leave the codebase in a more convergent state

Each migration step should move the codebase toward a clearer target, not a more confused middle ground.

- Reduce ambiguity between old and new patterns over time.
- Avoid creating multiple competing long-term patterns unless the domain truly requires them.
- Make it clear which direction future code should follow.
- Keep the migration path convergent, not open-ended.

## 10. Review migration quality by safety, clarity, and convergence

A migration is good when it moves the system forward without creating unnecessary confusion or risk.

Judge migration quality by whether it is:

- safe in transition
- clear in source and target intent
- proportionate in scope
- controlled in compatibility impact
- easy to validate
- convergent toward a coherent end state

## Core preference

When multiple migration approaches are valid, prefer the one that best preserves:

1. transition safety
2. clarity of source and target states
3. compatibility control
4. incremental verifiability
5. convergence toward a coherent end state

Prefer migrations that are disciplined, legible, and operationally safe, rather than migrations that chase the cleanest final design at the cost of transition risk.
