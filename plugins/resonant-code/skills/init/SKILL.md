---
name: init
description: "Initialize .resonant-code/playbook/local-augment.yaml by detecting project language, framework, and toolchain from strong signal files. Use when setting up resonant-code for a new project."
metadata:
  version: "0.1.0"
  author: "Sovea"
---

# Initialize Resonant Code

Bootstrap `.resonant-code/playbook/local-augment.yaml` for the current project by detecting
language, framework, and toolchain from strong signal files.

The generated file is the project's local playbook. It extends the resonant-code
built-in ruleset and is the entry point for all project-specific taste and conventions.
Commit it to the repository so the whole team benefits.

## Instructions

### Step 1 - Run detection script

```
node <this-skill-directory>/scripts/init.mjs <project-root> <this-plugin-directory>/playbook
```

### Step 2 - Handle result

The script prints JSON to stdout and uses exit codes to signal status.

**Exit 0 - Created successfully**

Parse the JSON output and print a confirmation in this format:

```
Created .resonant-code/playbook/local-augment.yaml
Updated .gitignore for resonant-code runtime artifacts

Detected:
  Language:        <detected.language or "-">
  Frameworks:      <detected.frameworks.join(", ") or "-">
  Package manager: <detected.packageManager or "-">

Built-in layers loaded:
  - <each entry in extends.included>

Ignored generated artifacts:
  - <each entry in gitignore.ignored>
```

If `extends.unavailable` is non-empty, append:

```
Detected but no built-in layer available yet:
  - <each entry in extends.unavailable>
  These will be supported in a future resonant-code release.
```

Then suggest the next steps:

```
Next steps:
  - Run /resonant-code:calibrate-repo-context to generate RCCL (Repository Context Calibration Layer) from your codebase.
  - Review .resonant-code/playbook/local-augment.yaml and rename meta.name if needed.
  - Commit .resonant-code/playbook/local-augment.yaml to share with your team.
```

**Exit 1 - File already exists**

Tell the user `.resonant-code/playbook/local-augment.yaml` already exists and ask whether to overwrite.
If the user confirms, re-run with `--force`:

```
node <this-skill-directory>/scripts/init.mjs <project-root> --force
```

Then print the summary as in exit 0.

**Any other error**

Report the error from stderr to the user verbatim.
Do not attempt to create the file manually.
