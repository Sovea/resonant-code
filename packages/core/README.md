# @sovea/stetra-core

Deterministic Intent, Decision, Observation, Assessment, and Adoption domain
for Stetra. Package version `0.0.1`, `cognitive-adoption` schema `1`.

```ts
import { schemas, planTransition, reduceTaskEvent, evaluateAdoption } from '@sovea/stetra-core';
```

`schemas` is the exact source of command inputs and immutable artifact shapes.
`planTransition` validates a closed task command against current state and
Runtime-supplied observations and identities. It returns a transition,
an unchanged result, or structured validation issues. `reduceTaskEvent` applies
committed events and their artifacts to rebuild state. `evaluateAdoption`
derives current bindings, pending Human choices, and disclosed limitations.

Human requests remain exact, with unattested relays labelled explicitly.
Engineering resolutions bind specific proposals. Reports and Assessments are
separate attributed records. Adoption requires a later Human event bound to
the exact current Package and its acknowledged limitations.

The package exports exactly these four runtime values plus TypeScript types.
It does not inspect repositories, execute commands, format output, know Host
files, or call an LLM. It contains no legacy compatibility layer.
