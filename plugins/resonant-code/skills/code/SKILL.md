---
name: code
description: "Guide code generation and changes to make the result conforms to best practices, has excellent specifications, and especially mathches the user's personal coding style and taste. Use when generating or modifying code."
metadata:
  version: "0.0.1"
  author: "Sovea"
---

# Resonant Code

Generate and modify code guided by a structured playbook of coding specifications to make the code conform to best practices, has excellent specifications, and especially mathches the user's personal coding style and taste.

Use the shared playbook resolution guidance from `_shared/playbook-resolution.md` to locate, interpret, and apply playbook rules before writing or changing code.

## 1. Task Framing

Before generating or modifying code, identify the task type. The task type determines which playbook sections are relevant and how aggressively to change the code.

Common task types include:

- **Feature**: implement new product or technical behavior while keeping the result maintainable and consistent with the existing codebase
- **Bugfix**: fix the root cause with the smallest reasonable change, preserve existing behavior outside the bug surface, and avoid unrelated rewrites
- **Refactor**: improve structure, readability, or maintainability without changing intended external behavior
- **Migration**: move code across APIs, patterns, versions, or architectures with emphasis on safety, compatibility, and incremental change
- **Review-related implementation**: apply or follow up on review feedback while preserving the original intent of the code

Also determine the delivery context before coding:

- whether the task is **new implementation** or **modification of existing code**
- whether the change should be **minimal and local** or may involve **broader restructuring**
- which **language**, **framework**, and **domain** are relevant
- whether the repository already shows strong local conventions that should be preserved

Prefer the narrowest correct framing. Do not treat a small fix as a rewrite. Do not treat a rewrite as a local patch.

## 2. Resolve Playbook

Before writing code, resolve the applicable playbook guidance using `_shared/playbook-resolution.md`.

Apply that shared resolution process to:

1. find the relevant playbook source
2. identify the relevant sections
3. get final single working interpretation for the current task

When coding, do not quote the playbook back to the user. Internalize it and express it through the code itself.

Use the resolved playbook guidance to make implementation decisions such as:

- how much to change
- what to abstract and what to leave direct
- how to name things
- how to structure modules, functions, components, and interfaces
- how strongly to optimize for clarity, reuse, performance, or flexibility
- how to match repository conventions without blindly copying weak patterns

If the repository's established local style clearly conflicts with the broader playbook, prefer local consistency unless it would preserve a serious quality problem.

## 3. Output Contract

Produce code that is directly useful, context-aware, and aligned with the resolved playbook guidance.

### Default output behavior

- When the user asks for implementation, provide the implementation directly
- Keep explanation brief unless the user explicitly asks for deeper reasoning
- Do not spend output space repeating obvious rules or generic best practices
- Prefer showing the concrete solution over describing what you might do

### For new code

- Write code that is complete enough to be adopted or adapted with minimal extra work
- Follow the relevant language, framework, task-type, and domain guidance
- Choose straightforward designs unless the task clearly requires stronger abstraction
- Make interfaces, naming, and control flow easy to understand
- Include only the amount of structure the task actually earns

### For changes to existing code

- Prefer minimal, targeted, and reversible changes
- Preserve surrounding conventions unless there is a strong reason to improve them
- Do not rewrite unrelated areas just to make the result look cleaner
- Improve local quality when possible, but avoid scope creep

### For quality expectations

Unless the task explicitly calls for a looser standard, aim for code that is:

- correct
- readable
- locally consistent
- maintainable
- appropriately typed or structured for the language
- careful at boundaries, side effects, and error cases

Where relevant, also include:

- necessary validation or guardrails at boundaries
- tests or test updates for meaningful behavior changes
- concise notes about important assumptions, trade-offs, or follow-up work

### What to avoid

- overengineering for hypothetical future reuse
- speculative abstractions
- clever but hard-to-read code
- noisy commentary around obvious code
- large structural rewrites when a smaller change is sufficient
- mechanically applying playbook rules in ways that feel unnatural in the current repository

The final result should feel like code that belongs in the target codebase and reflects strong engineering judgment, not just compliance with a checklist.
