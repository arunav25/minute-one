# Architecture overview

The code map, and the two invariants everything else exists to protect.

## The invariants

**1. Only the controller advances a step.** The voice provider speaks, listens
and requests tools. There is no method on the `VoiceAdapter` interface for
reporting that a step succeeded — that is enforced by the type, not by
convention. A model that becomes convinced the user is finished still cannot
move the session forward.

**2. A step with no declared proof never passes.** The verifier treats an empty
success rule as unproven. A half-authored journey therefore fails closed: the
guide stalls and says so, rather than marching through unverified steps.

Everything below is in service of those two sentences.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ app/                    Next.js — landing, console, report    │
│   api/minute-one/       config · session · events · knowledge │
├──────────────────────────────────────────────────────────────┤
│ src/server/             Product, journey, knowledge, event    │
│                         stores. NeonDB or local JSON.         │
├──────────────────────────────────────────────────────────────┤
│ packages/web/           The embeddable SDK. Overlay, spotlight,│
│                         DOM observer, boot-from-key.          │
├──────────────────────────────────────────────────────────────┤
│ packages/core/          The engine. Controller, verifier,      │
│                         budgets, events, report.              │
├──────────────────────────────────────────────────────────────┤
│ packages/voice-*/       One adapter per vendor, behind one     │
│                         interface.                            │
└──────────────────────────────────────────────────────────────┘
```

Dependencies point downward only. `core` imports nothing from `web`, `app` or
any vendor package — it is the piece you could lift into another product.

## packages/core — the engine

Generic. Knows about flows, steps, evidence and budgets; knows nothing about
products, help centres, Deepgram or JustCall.

| File | Responsibility |
| --- | --- |
| `types.ts` | `FlowDefinition`, `FlowStep`, `StepTarget`, `SessionEvent`, terminal states |
| `controller.ts` | The state machine. Instruct → observe → verify → advance or recover |
| `verifier.ts` | Evaluates `all` / `any` / `not` rule groups against a page snapshot |
| `voice-contract.ts` | `VoiceAdapter` — the whole provider surface |
| `report.ts` | Aggregates the event log into a session report |
| `budgets.ts` | Time, step-count and voice-minute ceilings |

### The step loop

```
observe → precondition met? ──no──► recovery / route correction
   │yes
speak one instruction
   │
wait for the page to change (fingerprint diff, debounced)
   │
verify declared success rules
   │
 passed? ──yes──► record evidence, advance
   │no
 attempts left? ──yes──► next recovery mode (location → recognition → reset)
   │no
 offer phone help, end as `partial` or `failed`
```

Recovery is selected from prepared modes rather than regenerated freely, so the
second explanation is *materially* different from the first instead of a
paraphrase of it.

### Terminal states

Every session ends in exactly one, written to the event log **before** the UI
displays it:

| State | Meaning |
| --- | --- |
| `completed` | The final step's proof was observed |
| `partial` | The user left after at least one proven step |
| `failed` | No recovery remained, or a hard error |
| `deadline` | Time, step or voice budget exhausted |

## packages/web — the embeddable SDK

Runs inside somebody else's page, so it is defensive by construction.

| File | Responsibility |
| --- | --- |
| `browser-entry.ts` | Script-tag entry. Auto-boots from `data-product-key` |
| `boot.ts` | Fetches config by key, assembles flows, injects the search tool |
| `sdk.ts` | Wires overlay ↔ controller ↔ adapter; owns journey selection |
| `overlay.ts` | The panel and orb, in a Shadow DOM root |
| `spotlight.ts` | Resolves a step's target and draws the ring |
| `dom-observer.ts` | Snapshots the page |
| `redaction.ts` | Strips anything that must never leave the page |

**Shadow DOM** matters here: the host's CSS cannot reach in and break the guide,
and the guide's CSS cannot leak out and break the host.

**Target resolution** is tried in order — ARIA role + accessible name, then
accessible name, then `data-testid`, then a CSS selector. Name first because a
selector breaks the moment the host's markup moves; selectors exist because real
apps are full of icon-only buttons with no name to match.

**Redaction** happens before the snapshot leaves the observer: visible elements
only, no raw HTML, no form values, and phone numbers, emails, keys and card
numbers scrubbed from text.

## packages/voice-* — the vendor adapters

Each is a single file behind `VoiceAdapter`:

```ts
connect(options)          // persona, greeting, tool declarations, handlers
say(text)                 // speak a line, honouring barge-in
pushContext(packet)       // grounding facts, without speaking
respondToTool(id, result) // answer a tool call the model raised
disconnect(reason)
```

Note what is missing: nothing here can advance a step.

Adapters report a `VoiceProviderProof` — provider, model, session id, minutes,
`isRealVoice` — which is written to the event log and shown in the console. A
demo run can never be mistaken for a real one.

## src/server — state

| Module | Responsibility |
| --- | --- |
| `product-store.ts` | Products, keys, origins, journeys. Neon or local JSON |
| `compile-config.ts` | Product → runtime config: persona + compiled flows |
| `knowledge-store.ts` | pgvector search, trained-source listing |
| `embeddings.ts` | Query and batch embedding |
| `event-store.ts` | Append-only session events |
| `origins.ts` | Allowlist matching, including wildcard subdomains |
| `db.ts` | Neon connection |

Each store follows one pattern: **Neon when `DATABASE_URL` is set, a local file
otherwise.** Only the read/write pair differs, so the rules live in one place
and the tests run with no database.

## The request path

```
host page
   │  <script data-product-key="mo_pk_…">
   ▼
GET  /api/minute-one/config?key=…      → persona, flows, knowledgeSearch flag
POST /api/minute-one/session?key=…     → short-lived voice token (origin-checked)
GET  /api/minute-one/knowledge/search  → nearest passages (agent tool)
POST /api/minute-one/events            → append-only session events
```

The product key is public by design — it selects context. It cannot mint voice
on its own: `/session` checks the calling origin against the product's allowlist
*and* the server's own spend gate before exchanging the long-lived provider key.

## Further reading

- [`knowledge-base.md`](knowledge-base.md) — ingest, embedding, retrieval
- [`journeys.md`](journeys.md) — authoring steps, targets and proofs
- [`../troubleshooting.md`](../troubleshooting.md) — the traps that cost us hours
