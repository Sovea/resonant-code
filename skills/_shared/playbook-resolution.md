# Playbook Resolution

## Overview

Playbook resolution is handled by the Playbook Runtime, not by the agent directly.
The agent's responsibility is to collect the correct inputs, invoke the Runtime,
and apply the resulting Effective Guidance Object (EGO) when generating or reviewing code.

Do not attempt to read, interpret, or merge playbook files manually.
The Runtime handles parsing, conflict resolution, RCCL calibration, and EGO assembly.

---

## 1. Collect Inputs

Before invoking the Runtime, collect the following inputs:

**Built-in playbook root**
The default built-in playbook ships with the plugin:
`<plugin-directory>/playbook/`
This path is always available and requires no resolution step.

**Local playbook (optional)**
Check for `.resonant-code/playbook/local-augment.yaml` in the current project root.
If it exists, pass its path to the Runtime.
If it does not exist, proceed without it — the Runtime will use built-in rules only.

**RCCL (optional)**
Check for `.resonant-code/rccl.yaml` in the current project root.
If it exists, pass its path to the Runtime.
If it does not exist, proceed without it — the Runtime will skip RCCL calibration.

**Task intent**
Describe the current task as a natural language string.
The Runtime's Intent Parse stage will convert it to a structured `TaskIntent`.
Be specific: include the operation type, target area, and relevant technology if known.

Example:
```
operation: "adding a new payment webhook handler"
target: "src/features/payments/webhooks.ts"
tech: "typescript, nextjs"
```

---

## 2. Invoke the Runtime

Pass all collected inputs to the Playbook Runtime:
```
PlaybookRuntime.compile({
  builtinRoot:   "<plugin-directory>/playbook/",
  localAugment:  ".resonant-code/playbook/local-augment.yaml",   // omit if not present
  rccl:          ".resonant-code/rccl.yaml",                     // omit if not present
  taskIntent:    "<natural language task description>",
})
```

The Runtime will execute the full pipeline internally:
1. Intent Parse — structured TaskIntent from natural language
2. Layer Filter — drop layers irrelevant to the current task
3. RCCL Verify Gate — validate observed patterns against actual code
4. Semantic Merge — conflict detection and resolution
5. EGO Assembly — produce the final guidance object within token budget

The Runtime returns an `EffectiveGuidanceObject (EGO)`.

---

## 3. Apply the EGO

The EGO contains four sections. Apply each as follows:

**`must_follow`**
Non-negotiable directives for this task.
Apply all of them. Do not skip or soften must directives.
Each entry includes a `statement`, `rationale`, `exceptions`, and `examples`.
Use the `rationale` when making trade-off decisions.
Use the `examples` as the primary reference for what good and bad code looks like
in this specific project.

**`avoid`**
Patterns explicitly suppressed for this task.
Do not generate code matching these patterns, even if they appear in the
surrounding codebase. Each entry includes a `trigger` identifying the source rule.

**`context_tensions`**
Directives where the rule and the observed repository reality conflict.
Each entry includes:
- `directive_id` — which rule applies
- `execution_mode` — how to apply it (`enforce` / `deviation-noted`)
- `conflict` — what the tension is
- `resolution` — the specific instruction for this task

Follow the `resolution` instruction exactly.
`deviation-noted` means: apply the rule as stated, and account for the observed
legacy pattern at interfaces and call sites — do not blindly ignore existing code.

**`ambient`**
Background context about the repository's observed patterns.
Use this to inform style and structural decisions where the rules do not prescribe
a specific outcome. These are not directives — they are environmental signals.

---

## 4. Handle Runtime Unavailability

If the Playbook Runtime is not yet available or fails to respond:

1. Log the failure clearly: "Playbook Runtime unavailable — proceeding without EGO."
2. Fall back to built-in `core` principles only (correctness, clarity, local consistency,
   minimal change).
3. Do not attempt to manually parse or interpret playbook YAML files as a substitute.
4. Do not block the task — proceed with reduced guidance and note the limitation.

---

## 5. Precedence When Applying the EGO

Apply EGO guidance with the following precedence:

1. Explicit user instructions in the current conversation
2. `must_follow` directives from the EGO
3. `context_tensions` resolutions from the EGO
4. Established repository conventions (informed by `ambient` signals)
5. `avoid` suppressions from the EGO
6. Default skill behavior

Do not override explicit user instructions with EGO content.
Do not quote EGO content back to the user — apply its intent in the code you generate.
Treat the EGO as operational constraints, not as text to cite.
