# Stetra

## Problem

Coding Agents can produce changes faster than developers can reconstruct their
behavior, engineering choices, and limitations. Stetra keeps developer direction,
engineering understanding, and authority connected to the actual work.

## Core design

Stetra is a project layer inside the coding Host, with Codex as the primary Host.
The Host owns conversation, model execution, implementation, and repair. Stetra
connects five parts of one admitted coding task:

- **Intent**: exact developer direction, corrections, and Agent interpretation.
- **Decision**: engineering choices, alternatives, consequences, and authority.
- **Observation**: actual changes, executed checks, and retained evidence.
- **Assessment**: separately attributed analysis of behavior, mechanism, omissions,
  contradictions, and unknowns.
- **Adoption**: the developer's explicit decision about the current result.

Reconciliation relates assessed changes to direction, decisions, implementation
claims, and observed evidence. It makes gaps inspectable so they can be repaired,
explained, or decided by the developer. Existing authorization supports autonomous
repair; new choices require developer input only when that authority is insufficient.

Developers own direction and final decisions. Agents own interpretation,
implementation, and semantic judgment. Runtime owns observed facts, identity,
ordering, persistence, and structural validation. These responsibilities remain
distinct; passing checks or confident analysis cannot substitute for a developer
decision.

Evidence remains inspectable across corrections. A decision binds to an exact
current result; changed inputs invalidate that binding without erasing history.

## Implementation boundary

`Host adapter -> CLI -> Core`. Core contains the deterministic task domain and
schemas. CLI owns repository IO, check execution, persistence, and presentation.
Model execution stays in the Host.

Admission and assurance follow explicit developer direction or project policy.
Keep routine work small. Every required record or interaction must support a
concrete alignment, repair, understanding, or decision need. Runtime must not
infer semantic importance or authority through heuristics or scalar scores.
