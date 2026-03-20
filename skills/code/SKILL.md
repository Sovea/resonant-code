---
name: code
description: "Skill for implementing, modifying, fixing, or refactoring code. It compiles task-time guidance through Runtime, applies the compiled EGO during implementation, and writes quality signals back to the lockfile after the task."
metadata:
  version: "0.1.0"
  author: "Sovea"
---

# Code And Modify With Runtime Guidance

Use this skill for concrete coding work:

- implement a feature
- modify existing code
- fix a bug
- refactor an area without redesigning the whole system

If the user is asking for actual code changes, this is the skill that should be used.
Its primary job is coding. Runtime integration exists to guide that coding work, not to
replace it.

This skill is a thin Runtime consumer.

Do not read or merge playbook files manually.
Do not reconstruct EGO logic in the skill.
Do not use raw playbook YAML as the primary prompt input.

Use the Runtime to compile guidance for the current coding task, then use the
compiled `ego` while actually implementing the requested code change.

## Instructions

### Step 1 - Compile task guidance

Run:

```sh
node <this-skill-directory>/scripts/code.mjs prepare <project-root> --task "<user task>" [--target-file <path>] [--changed-file <path>] [--tech <name>] [--tag <name>] [--operation <create|modify|bugfix|refactor>]
```

Pass `--changed-file` for each known changed or directly relevant file.
Pass `--tech` only when there is a strong hint not already obvious from the target file.

The script prints JSON:

```json
{
  "status": "ok",
  "sessionPath": "<path>",
  "ego": { "...": "compiled guidance object" },
  "trace": { "...": "decision trace" },
  "warnings": []
}
```

If `status` is `ok`:
- Use `ego.guidance.must_follow` as the operational constraints for implementation.
- Use `ego.guidance.avoid` to suppress bad patterns.
- Use `ego.guidance.context_tensions` to handle repository conflicts explicitly.
- Use `ego.guidance.ambient` only as background repository context.
- Treat `trace` as developer/debug output. Do not dump it to the user unless it helps explain a conflict or failure.

If `status` is `degraded`:
- State briefly that Runtime guidance was unavailable.
- Continue with reduced guidance only: correctness, clarity, local consistency, minimal change.
- Do not fall back to manually parsing playbook YAML.

### Step 2 - Implement the task

Implement the requested code change using the compiled `ego` as the guidance layer.

Precedence while coding:
1. explicit user instructions
2. `ego.guidance.must_follow`
3. `ego.guidance.context_tensions`
4. local repository reality informed by `ego.guidance.ambient`
5. `ego.guidance.avoid`

Do not quote raw EGO sections back to the user as policy text.
Apply them in the code and in your technical decisions.

### Step 3 - Write lockfile feedback

After the implementation work is complete, run:

```sh
node <this-skill-directory>/scripts/code.mjs complete --session <session-path> [--ignored <directive-id>] [--followed <directive-id>]
```

If you do not pass any directive ids, the script uses a conservative first-pass approximation:
- all compiled `must_follow` directives are treated as followed
- no directives are treated as ignored

The script prints JSON:

```json
{
  "status": "updated",
  "lockfilePath": "<project-root>/.resonant-code/playbook.lock.yaml",
  "followedDirectiveIds": ["..."],
  "ignoredDirectiveIds": []
}
```

If completion is skipped because Runtime guidance was unavailable, report that briefly.
Do not manually write the lockfile.
