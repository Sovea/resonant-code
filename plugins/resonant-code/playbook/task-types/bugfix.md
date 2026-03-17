# Bugfix

Use this guidance when correcting incorrect behavior, resolving regressions, or addressing defects in existing code.

Bugfix work should fix the real problem with the smallest reasonable change that fully resolves it. The goal is not to make the area look better in general, but to restore correctness with control, clarity, and minimal unintended impact.

## 1. Fix the real problem

Aim at the actual defect, not just its visible symptom.

- Prefer root-cause fixes over cosmetic suppression.
- Confirm what is actually broken before changing structure.
- Do not patch around uncertainty if the real failure mode can be understood.
- Make the intended corrected behavior clear in the code.

## 2. Keep the change surface narrow

A bugfix should usually be local, targeted, and easy to review.

- Make the smallest reasonable change that fully resolves the issue.
- Avoid unrelated rewrites, renames, moves, or cleanup.
- Do not expand scope just to improve style or architecture.
- Prefer reversible and easy-to-verify changes over broad restructuring.

## 3. Preserve existing behavior outside the bug

Correct the defect without destabilizing adjacent behavior.

- Preserve intended behavior outside the bug surface.
- Be careful when changing shared code, common utilities, or public interfaces.
- Avoid fixing one path by creating uncertainty in others.
- Treat regressions introduced by the fix as part of the bugfix failure surface.

## 4. Be precise about assumptions and boundaries

Bugfixes often fail when hidden assumptions remain implicit.

- Make important assumptions visible rather than relying on accidental behavior.
- Handle edge cases, invalid states, and boundary conditions that are directly related to the defect.
- Do not silently narrow behavior unless that narrowing is truly part of the fix.
- Be especially careful at external inputs, state transitions, concurrency boundaries, and side effects.

## 5. Prefer clarity over patch cleverness

A fix should be understandable to the next engineer who reads it.

- Prefer direct, legible fixes over fragile tricks.
- Do not hide the repair behind unnecessary abstraction.
- Keep control flow and intent easy to follow.
- If the defect reveals structural weakness, improve only as much as necessary to make the fix sound.

## 6. Respect repository reality

A good fix should still feel native to the codebase.

- Match local conventions unless doing so would preserve the defect.
- Do not introduce foreign patterns or a new architectural style during a local fix.
- Improve the code in ways that still fit the surrounding repository.
- Prefer consistency with nearby code when multiple valid fixes exist.

## 7. Add the supporting validation the fix needs

A bugfix is incomplete if the defect can easily reappear without detection.

Where relevant, include:

- a targeted test or test update that captures the corrected behavior
- validation of edge cases directly tied to the bug
- concise notes about the key assumption, trade-off, or limitation if the fix is not obvious

Do not add broad test or refactor work unrelated to proving the fix.

## 8. Escalate structure only when necessary

Most bugs should not trigger redesign. Some bugs do expose a structural flaw. Distinguish the two.

- Prefer local fixes when the bug is local.
- Introduce a larger structural change only when a narrow fix would be fragile, misleading, or repeatedly error-prone.
- If broader restructuring is necessary, keep it tightly justified by the defect.
- Do not turn a bugfix into an opportunistic rewrite.

## 9. Review bugfix quality by soundness and containment

A bugfix is good when it is both correct and contained.

Judge bugfix quality by whether it is:

- correct
- targeted
- low-risk outside the intended fix area
- easy to understand
- easy to verify
- consistent with the surrounding codebase

## Core preference

When multiple bugfix approaches are valid, prefer the one that best preserves:

1. correctness
2. root-cause soundness
3. minimal unnecessary change
4. local consistency
5. ease of verification

Prefer fixes that solve the defect cleanly and proportionately, rather than fixes that use the bug as an excuse to redesign unrelated code.
