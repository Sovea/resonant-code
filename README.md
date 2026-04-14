# resonant-code

An AI coding governance/runtime layer that helps agents produce code worth adopting, not just code that looks plausible.

Coding agents can already generate plausible code. The harder problem is producing changes that fit the current repository, respect engineering constraints, stay proportional to the task, and are easy for a human developer to review and trust. resonant-code is built for that problem.

It is designed for high-standard individual developers and small-team tech leads who want AI coding to feel collaborative rather than opaque: engineering principles should activate by context, tradeoffs should be explainable, and accepted or rejected decisions should improve future behavior.

## Installation

```sh
# add marketplace
/plugin marketplace add sovea/cc-marketplace

# install plugin
/plugin install resonant-code@sovea
```

## Recommended quickstart workflow

```sh
# 1. Initialize local prescriptive guidance
/resonant-code:init

# 2. Analyze the repository and generate verified observational signals
/resonant-code:calibrate-repo-context

# 3. Run task-time change decision compilation before coding
/resonant-code:code <task description>
```

> Suggested step: Review, extend, and commit `.playbook/local-augment.yaml` so project-specific engineering decisions become durable team assets.

## Architecture in one line

**Playbook** defines what should happen. **RCCL** captures what is true in the repository now. **Runtime** compiles both against task intent into a task-level change decision packet. **Lockfile feedback** records what happened so the system can improve over time.

## Design philosophy

resonant-code treats AI coding as a change-governance problem rather than a prompt-writing problem. Its task-time runtime compiles the following inputs:

| Input | What it represents |
|---|---|
| **Built-in playbook** | Prescriptive engineering guidance and default rules |
| **Local augment** | Project-specific principles, tradeoffs, and overrides |
| **RCCL** | Verified observational signals about current repository reality |
| **Task intent** | The goal, scope, and shape of the current change |

The runtime does not hand raw rules to the agent and hope for the best. It compiles these inputs into a task-level decision artifact with two primary views:

- **EGO** (Effective Guidance Object) — the structured agent-facing guidance for this task
- **Decision Trace** — the developer-facing record of what was applied, suppressed, or marked as a repository tension

That artifact is the core unit of collaboration for a change: it explains why the agent should take a particular path before code is generated, not just after the diff appears.

The key architectural constraint is unchanged: prescriptive guidance (playbook) and observational signals (RCCL) stay separated in the data model and never compete on the same scoring axis. RCCL changes how a rule is executed in this repository — `enforce`, `deviation-noted`, `ambient`, or `suppress` — instead of acting like another loose pile of rules.

Most agent tooling injects flat text instructions and relies on the model to resolve conflicts ad hoc. resonant-code treats this as a runtime and data-model problem:

- Guidance is structured, layered, and designed for conflict handling
- Repository observations are statically verified before they influence behavior
- Runtime resolves tensions before the agent starts coding
- The agent receives a deterministic EGO instead of raw policy text
- Feedback from real task outcomes can flow back into the quality loop

The goal is not another wrapper around an agent. The goal is a reusable collaboration runtime for change decisions.

## Todo / Upcoming Features

- [ ] directive refinement workflow
- [ ] stronger lockfile-driven quality flywheel
- [ ] code review skill built on the same runtime

## License

MIT
