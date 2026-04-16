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
- `--scope` optionally narrows analysis, default `auto`

The prepare phase now builds a repository index, structural slice plan, and deterministic code windows before writing the prompt artifact.
It also emits calibration report artifacts under `.resonant-code/context/`.

The script prints JSON:

```json
{
  "promptPath": "<path-to-generated-prompt-file>",
  "metadata": {
    "scope": "auto",
    "stats": {
      "total_files": 120,
      "indexed_files": 120,
      "selected_slices": 6,
      "windows": 18
    },
    "reportPath": "<path-to-report-json>",
    "slicePlanPath": "<path-to-slice-plan-json>"
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
- `support` must be present and describe evidence provenance conservatively
- `id` must match `/^obs-[a-z0-9-]+$/`
- `semantic_key` is required and must be a stable kebab-case semantic identity
- `confidence` must be between `0` and `1`
- `adherence_quality` must be `good`, `inconsistent`, or `poor`
- `category` must be one of `style`, `architecture`, `pattern`, `constraint`, `legacy`, `anti-pattern`, `migration`
- `pattern` should stay human-readable; identity stability comes from `semantic_key`

### Step 3 - Validate, verify, and commit

```sh
node <this-skill-directory>/scripts/calibrate-repo-context.mjs commit <project-root> --input <path-to-yaml-file>
```

Where:
- `<path-to-yaml-file>` contains the YAML generated in Step 2

The commit phase performs five things:
1. Parse generated YAML into candidate observations
2. Deterministically consolidate candidates into final observations
3. Static evidence verification against the repository
4. Induction verification for scope/support quality
5. Write the current verified calibration result authoritatively to `.resonant-code/rccl.yaml`

It also emits commit-time debug artifacts under `.resonant-code/context/` for candidates and consolidation output.

Exit `0`: committed successfully. Parse stdout JSON:

```json
{
  "written": ".resonant-code/rccl.yaml",
  "stats": { "added": 5, "updated": 2, "preserved": 3 },
  "artifacts": {
    "candidates": "<path-to-candidate-artifact>",
    "consolidation": "<path-to-consolidation-artifact>"
  }
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
