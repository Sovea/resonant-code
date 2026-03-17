# Playbook Resolution

## 1. Find Playbook

Execute the following steps in order to resolve the playbook for tasks:

Step 1: Check if the user explicitly specified a playbook path in this conversation. If yes, use it as PLAYBOOK_ROOT_PATH.

Step 2: Check if a `.playbook.yaml` exists in the current project root directory. If yes, read it, use the `playbook.root_path` field as PLAYBOOK_ROOT_PATH.

Step 3: Fall back to the default built-in playbook path: `<this-plugin-directory>/playbook/`.

Once PLAYBOOK_ROOT_PATH is resolved, announce it: "📝 Using playbook at `<PLAYBOOK_ROOT_PATH>`".

## 2. Understand Playbook Structure

A playbook is a directory-based collection of coding specifications. `playbook.yaml` defines structure and metadata.

Interpret the playbook by layer instead of treating it as one flat list of rules:
  - `core`: universal engineering principles that apply across languages, frameworks, and domains
  - `languages`: language-specific conventions, idioms, and constraints
  - `frameworks`: framework-specific patterns, lifecycle expectations, and anti-patterns
  - `task-types`: guidance for the current kind of work, such as feature work, bugfixes, refactors, migrations, or reviews
  - `domains`: application- or product-specific preferences, priorities, and trade-offs

Use each layer only for what it is meant to govern. Do not let one layer substitute for another.

## 3. Apply Playbook to the Current Task

Apply the playbook in a focused way.

1. Identify the task type, language, framework, and domain that are relevant to the current request.
2. Read only the playbook sections that materially affect the task.
3. Start from `core`, then layer in more specific guidance from `languages`, `frameworks`, `task-types`, and `domains`.
4. Combine the selected guidance into a single working interpretation for the task at hand.
5. Use that resolved interpretation when generating code or reviewing code.

Do not load unrelated sections just because they exist. Prefer targeted application over exhaustive reading.

## 4. Resolve Conflicts and Adopt Rules

Adopt playbook guidance with clear precedence.

Prefer, in order:

1. explicit user instructions
2. established repository reality and existing local conventions
3. more specific playbook guidance
4. broader playbook guidance
5. default skill behavior

More specific guidance should usually override broader guidance when both apply. For example, task-type, framework, or domain guidance may refine how `core` principles are expressed in practice.

Do not force playbook rules in ways that produce awkward, inconsistent, or clearly out-of-place results in the current repository.

Treat playbook guidance as operational constraints, not as text to quote back. Apply the intent of the rules, not just their wording.

When multiple rules are compatible, prefer the interpretation that yields clearer, simpler, and more repository-consistent results.

## 5. Handle Missing, Weak, or Conflicting Guidance

If relevant guidance is missing, continue with the best available lower-level or broader guidance instead of blocking on completeness.

If guidance is vague, apply its intent conservatively and prefer simpler, more legible outcomes.

If guidance conflicts and cannot be fully reconciled, choose the option that best preserves:
- correctness
- clarity
- local consistency
- minimal unnecessary change

Do not overfit to incomplete playbook text. Avoid speculative abstractions or heavy rewrites just to appear compliant.