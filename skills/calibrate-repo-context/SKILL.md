---
name: calibrate-repo-context
description: "Generate RCCL (Repository Context Calibration Layer) by sampling local code, extracting observation signals, and writing back statically verified calibration data."
metadata:
  version: "0.2.0"
  author: "Sovea"
---

# Calibrate Repository Context

Generate `.resonant-code/rccl.yaml` for the current repository.

RCCL is not a repo wiki or full codebase summary. It is a compact set of observational
signals that materially affect code generation, modification, and review quality.

This skill now has a verify gate:
- The LLM generates candidate observations with evidence.
- The runtime statically verifies that evidence against the repository.
- Verification results are written back into each observation's `verification` block.
- Failed or unverifiable observations are demoted instead of being trusted blindly.

## Instructions

### Step 1 - Prepare context samples

```sh
node <this-skill-directory>/scripts/calibrate-repo-context.mjs prepare <project-root> [--scope <glob>]
```

Where:
- `<project-root>` is the repository to calibrate, usually `.`
- `--scope` optionally narrows analysis, default `src/**`

The script prints JSON:

```json
{
  "promptPath": "<path-to-generated-prompt-file>",
  "metadata": {
    "scope": "src/**",
    "stats": { "total": 120, "sampled": 30, "truncated": 5 }
  }
}
```

Exit `0`: preparation succeeded.
Exit `1`: report stderr and stop.

### Step 2 - Generate RCCL observations

Read the prompt text from the returned `promptPath` file. Use that file content as your own input and write the generated RCCL YAML to a file. Do not inline the full prompt into a shell-quoted command.

Critical constraints:
- Every observation must include real `evidence`
- `verification` must be present and all its fields must be `null`
- `id` must match `/^obs-[a-z0-9-]+$/`
- `confidence` must be between `0` and `1`
- `adherence_quality` must be `good`, `inconsistent`, or `poor`
- `category` must be one of `style`, `architecture`, `pattern`, `constraint`, `legacy`, `anti-pattern`, `migration`
- Prefer stable semantic IDs so repeated calibrations can update prior observations cleanly

### Step 3 - Validate, verify, and commit

```sh
node <this-skill-directory>/scripts/calibrate-repo-context.mjs commit <project-root> --input <path-to-yaml-file>
```

Where:
- `<path-to-yaml-file>` contains the YAML generated in Step 2

The commit phase performs three things:
1. Schema validation
2. Static evidence verification against the repository
3. Merge and write to `.resonant-code/rccl.yaml`

Exit `0`: committed successfully. Parse stdout JSON:

```json
{
  "written": ".resonant-code/rccl.yaml",
  "stats": { "added": 5, "updated": 2, "preserved": 3 }
}
```

Print a confirmation:

```text
RCCL calibration complete - .resonant-code/rccl.yaml updated.

Added:     <stats.added> observations
Updated:   <stats.updated> observations
Preserved: <stats.preserved> observations
```

Exit `1`: validation failed. Report structured errors from stderr and do not write the file manually.
