# AGENTS.md

## Project Background

`resonant-code` is a plugin-oriented guidance system for coding agents.

Its goal is not to build a full repository wiki or a general knowledge base.
Its goal is to help coding agents generate, modify, and review code in a way that is:

- aligned with built-in engineering best practices
- aligned with project-local preferences and team taste
- aware of the current repository reality without blindly inheriting it
- stable, explainable, and reusable across tasks

The core problem this project addresses is the gap between:

- code that is merely plausible
- code that a developer or team actually wants to keep

Common failure modes this project tries to reduce:

- overengineering
- unnecessary rewrites
- poor fit with local repository structure and conventions
- generic or style-less output
- poor proportionality to the task
- review output with too much noise and weak judgment

## Core Architecture

The system is organized around four major inputs:

1. Built-in playbook
2. Local project augment
3. RCCL (Repository Context Calibration Layer)
4. Task intent

The plugin is designed so that:

- `init` prepares local project guidance
- `calibrate-repo-context` prepares repository observation signals
- Runtime compiles all relevant inputs into task-specific guidance
- `code`, `review`, and similar skills are only the moments that call Runtime

Runtime is not the final artifact.
Runtime is the compile-and-decision mechanism.
Its main outputs are:

- `EGO` (Effective Guidance Object) for the agent
- `Decision Trace` for developers and debugging

## Playbook Compiler Runtime - Target Design

The target Runtime is a deterministic guidance compiler and decision runtime.
Prescriptive signals and observational signals must remain hard-separated in the data model:

- Playbook is prescriptive
- RCCL is observational

The runtime should produce controlled tension between them instead of letting an LLM improvise trade-offs ad hoc.

### Layered Playbook Layout

Playbook is organized by physical layers:

```text
.playbook/
  core.yaml
  languages/
  frameworks/
  domains/
  local-augment.yaml
```

Target layer priority:

`core > languages > frameworks > domains > local`

`weight` only fine-tunes within the same layer.
It must never let a `should` outrank a `must`, and must never cross layer priority.

### Directive Model

Each directive is the atomic compile unit.
The design assumptions for directives are:

- globally stable `id`
- explicit `type`
- explicit `scope`
- explicit `prescription`
- explicit `weight`
- rationale and exceptions are first-class
- examples are mandatory for taste grounding

Important invariants:

- directive `id` must be globally unique and stable
- `prescription` is an enum and is a hard contract
- `weight` is a discrete tier, not a free numeric score
- examples are an array and must support multiple scenarios
- directives should not contain internal condition branching

### RCCL Design

RCCL is not a wiki and not a full summary.
It only stores observation signals that materially affect code generation, code modification, or review quality.

Each observation must contain:

- stable `id`
- `category`
- `scope`
- `pattern`
- `confidence`
- `adherence_quality`
- non-empty `evidence`
- runtime-owned `verification`

Verification is a hard requirement for trust.
LLM self-confidence alone is not trusted.

### RCCL Verify Gate

Verify Gate is static and must not call an LLM.
It checks:

- file existence
- valid line range
- snippet similarity against the actual source

Expected disposition behavior:

- fully verified observations stay trusted
- partially verified observations keep reduced confidence
- failed or unverifiable observations are demoted to ambient

Demotion is preferred over hard deletion because the pattern may still be real outside sampled evidence.

### Runtime Pipeline

The target pipeline is:

1. `Intent Parse`
2. `Layer Filter`
3. `RCCL Verify Gate`
4. `Semantic Merge`
5. `EGO Assembly`

Pipeline expectations:

- Runtime owns parsing and merge logic
- skills must not manually interpret raw playbook YAML as a substitute
- the final output must be deterministic enough to diff and reason about

### Intent Parse

Target `TaskIntent` fields:

- `operation`
- `target_layer`
- `tech_stack`
- optional `target_file`
- optional `tags`

The long-term design allows LLM-based structured parse with caching.
If implemented with heuristics first, keep the contract stable so it can be upgraded later.

### Semantic Merge

Target merge rules:

- local override beats built-in for the same semantic directive
- verified RCCL can reinforce a directive
- verified RCCL can create tension when repository reality conflicts with the directive
- demoted RCCL can only contribute ambient context
- anti-pattern observations can suppress patterns

In the full design, semantic conflict detection should use embeddings instead of category-only matching.

### Execution Modes

RCCL does not compete on the same score axis as directives.
It determines how rules should be executed in this repository context.

Target execution modes:

- `enforce`
- `deviation-noted`
- `ambient`
- `suppress`

`deviation-noted` is especially important:
it means "follow the rule for new work, but account for the current repository reality at interfaces and compatibility boundaries."

### EGO Output

The target agent-facing compiled object contains:

- `must_follow`
- `avoid`
- `context_tensions`
- `ambient`

This output should be structural and stable, not ad hoc prompt text.

### Decision Trace

Decision Trace is a first-class output, not optional debugging sugar.
It should record:

- which layers were applied or skipped
- RCCL verification outcomes
- merge or suppression outcomes
- final EGO section counts and budget behavior

### Lockfile and Quality Flywheel

The project explicitly wants a first-version quality loop.

Runtime should write execution quality to a lockfile, conceptually:

`.playbook.lock.yaml`

The lockfile should track:

- followed count
- ignored count
- follow rate
- trend
- breakdown by task type
- last seen

This exists to support long-term playbook evolution, not just single-task compilation.

## Current Roadmap Model

The intended user flow is:

1. Run `init`
2. Run `calibrate-repo-context`
3. During a concrete coding/review task, Runtime compiles guidance from:
   - built-in playbook
   - local augment
   - RCCL
   - task intent
4. Agent consumes the compiled `EGO`
5. Runtime writes feedback to the lockfile

At a product level:

- `init` creates local prescriptive guidance
- `calibrate-repo-context` creates observational guidance with verify gate
- Runtime is invoked at task time
- `code` / `review` are runtime consumers, not alternative rule engines

## Runtime Implementation Guidance

Runtime should be treated as a plugin-level subsystem, not as one more skill script.

Preferred structure:

```text
plugins/resonant-code/runtime/
  src/
  dist/
```

Recommended engineering rules:

- implement Runtime in TypeScript
- compile it to runnable ESM output
- expose a narrow public API
- keep skills thin
- do not let skills import Runtime internals directly

Desired public entrypoints:

- `compile(input)`
- `evaluateGuidance(input)`

Skills should call Runtime, not reimplement any part of the pipeline themselves.

## Current Implementation Status

The repository currently includes:

- built-in playbook files under `plugins/resonant-code/playbook/`
- `init` skill writing `.resonant-code/playbook/local-augment.yaml`
- `calibrate-repo-context` skill writing `.resonant-code/rccl.yaml`
- static RCCL verify gate in the calibration flow
- a first-pass TypeScript Runtime under `plugins/resonant-code/runtime/`

Current runtime state:

- TypeScript source lives in `plugins/resonant-code/runtime/src/`
- build output lives in `plugins/resonant-code/runtime/dist/`
- build currently uses a no-dependency local script based on Node's `stripTypeScriptTypes`
- Runtime exposes compile and lockfile feedback entrypoints

Current first-pass Runtime covers:

- type models
- deterministic intent parse
- built-in/local/RCCL loading
- RCCL verification consumption
- basic layer filtering
- deterministic EGO assembly
- decision trace generation
- lockfile feedback writing

Current limitations that should be understood before extending:

- intent parse is currently deterministic heuristics, not full structured LLM parse
- semantic merge is currently conservative and lexical, not embedding-based
- cache keys exist, but full cache storage and invalidation are not complete
- layer filtering and merge should continue moving toward the full target design above

These limitations are implementation-stage gaps, not architecture changes.
Do not treat them as the intended final design.

## Non-Negotiable Quality Constraints

When evolving this project, do not regress to these anti-patterns:

- raw prompt concatenation instead of compiled structural guidance
- skill-specific manual parsing of playbook data
- trusting raw RCCL without verification or disposition handling
- omitting Decision Trace
- treating lockfile or quality feedback as optional decoration

The long-term success condition is not "Runtime exists".
It is:

- Runtime is deterministic enough to inspect
- Runtime is useful enough that multiple skills can rely on it
- Runtime keeps improving through verified repository context and quality feedback
