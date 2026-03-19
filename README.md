# resonant-code

A Claude Code plugin that aims to narrow the gap between plausible code and code worth keeping.

Coding agents generate plausible code. The harder problem is generating code worth keeping — code that reflects engineering standards, fits local conventions, respects the current state of the codebase, and **most importantly, matches your preferences and taste**.

## Installation

```sh
# add marketplace
/plugin marketplace add sovea/resonant-code

# install plugin
/plugin install resonant-code@sovea
```

## Recommended workflow

```sh
# 1. Initialize resonant-code
/resonant-code:init

# 2. Analyze codebase for observational signals, generate RCCL
/resonant-code:calibrate-repo-context

# 3. Coding with Effective Guidance Object (EGO)
/resonant-code:code <task description>
```

> Suggested step: Review, extend and commit `.playbook/local-augment.yaml` to share taste with your team.

## Design philosophy

resonant-code uses the following informations as raw inputs:

| Input | What it represents |
|---|---|
| **Built-in playbook** | Prescriptive engineering standards (Rules the agent must/should/may/avoid obey) |
| **Local augment** | Project-specific taste and convention overrides |
| **RCCL** | Statically-verified observations of the current repository |
| **Task intent** | What the user wants in this specific task |

These inputs are compiled at task time by the Guidance Compiler — not interpreted ad hoc by each skill. The compiler resolves conflicts, calibrates rules against repository reality, and produces two outputs:

- **EGO** (Effective Guidance Object) — structured guidance injected into the agent's context
- **Decision Trace** — an auditable log of every rule applied, suppressed, or flagged as a deviation

The key architectural constraint: prescriptive guidance (playbook) and observational signals (RCCL) are separated at the data model layer and never compete on the same scoring axis. RCCL determines *how* a rule is applied — enforce, deviation-noted, ambient, or suppress — not *whether* it ranks above another rule.

Most agent tooling works by injecting rules as flat text and hoping the model interprets them consistently. resonant-code treats guidance compilation as an engineering problem:

- Rules are structured data with explicit prescriptions, examples, and conflict semantics
- RCCL observations are statically verified against actual code before they influence guidance
- The runtime resolves all conflicts and ambiguities before the agent sees anything
- The agent receives a clean, deterministic EGO — not raw rule text to interpret

The goal is a system that behaves like a compiler for engineering taste, not a collection of prompt templates.

## License

MIT
