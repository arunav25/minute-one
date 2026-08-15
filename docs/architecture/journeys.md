# Journeys

A journey is the one route through your product that you chose and proved. This
is how to author one so it guides correctly — and, more importantly, so it fails
honestly.

## Shape

```jsonc
{
  "id": "send-message",
  "goal": "Send a message to a contact",
  "goalPhrases": ["send a message", "send a text", "text someone", "message a contact"],
  "steps": [
    {
      "id": "open-contacts",
      "objective": "Open the contacts list",
      "instruction": "Open Contacts in the left menu.",
      "targetName": "Contacts",
      "successText": "Add Contact"
    }
  ]
}
```

A product holds **several** journeys. The agent picks one from what the user
says, matching against `goalPhrases`, preferring the longest matching phrase so a
specific reading beats a vague one.

## Each step

| Field | Purpose |
| --- | --- |
| `id` | Stable identifier; appears in the event log and the console |
| `objective` | What the user achieves. Never spoken |
| `instruction` | The spoken line. One action, ≤18 words |
| `targetName` | Accessible name of the control to ring |
| `targetSelector` | CSS fallback when the control has no accessible name |
| `successText` | Text that must be **visible** for the step to pass |
| `successRoute` | Route glob that must match, e.g. `/numbers*` |

## Choosing proof — the part that goes wrong

The proof must be **absent before the step and present after it.** That sounds
obvious and is the single easiest thing to get wrong.

A real example: for "search for the contact", the proof was `contact(s)` — but
the unfiltered list already reads *"13 contact(s)"*. The step passed the instant
Contacts opened, so the guide skipped straight past the search without ever
waiting for the user to type. It looked like the guide was racing ahead; in fact
it had been told the step was already done.

Fixing it meant choosing text that only exists in the finished state —
`1 contact(s)`, reachable only by narrowing the list.

Check both directions before trusting a proof:

```js
// in the host page's console, before the action
document.body.innerText.includes("Your proof string")   // must be false
// then perform the action
document.body.innerText.includes("Your proof string")   // must be true
```

Guidelines:

- Prefer text that appears **only** in the finished state — a dialog heading, a
  success notice, a field that appears once a prior choice is made.
- Beware text that is visible **behind a modal**. `Add Contact` sits under the
  "Message sent" dialog, so a final step proved by it passes early.
- Beware counts and other dynamic text unless the specific value is the proof.
- If nothing unique appears, **do not invent a step.** A step whose proof is
  always true is worse than no step; fold the action into the previous
  instruction, whose proof is real.

## Targets and the spotlight

Resolution order — accessible name, then `data-testid`, then CSS selector:

```jsonc
{ "targetName": "Send SMS" }                                        // best
{ "targetSelector": "tbody tr:first-child td:last-child button:last-of-type" }  // fallback
```

Prefer the name. A selector encodes the host's markup and breaks when it moves.
Selectors exist because real apps are full of icon-only buttons — the message
action on a contact row has no name to match on, and without a selector the
guide can talk about it but never point at it.

If a target cannot be resolved (missing, ambiguous, hidden) the ring is simply
absent and the panel says why. **Resolution never affects verification** — the
spotlight is a hint; the proof is the gate.

If you control the host application, adding `aria-label` to icon-only controls is
strictly better than a selector: it survives redesigns and makes the app usable
with a screen reader.

## Writing the instruction

- One action. If it contains "and then", it is two steps.
- Use the words on screen: *"Choose **Add Number**, top right."*
- No internal vocabulary — not selectors, step ids, or "the verification gate".
- Say where, when it helps: "top right", "on their row", "in the left menu".

The engine adds two recovery lines automatically (recognition, then reset). The
model may rephrase, but never repeats the primary instruction verbatim.

## Goal phrases

Write how a user actually asks, not what the feature is called:

```jsonc
"goalPhrases": ["send a message", "send a text", "text someone", "message a contact"]
```

If nothing matches, the guide names what it *can* walk through rather than
starting the wrong journey.

## Authoring

Journeys live on the product record in NeonDB. Today the console's Journey
editor still assumes a single journey; author additional ones through the API:

```bash
curl -X POST http://localhost:3200/api/minute-one/products \
  -H "content-type: application/json" \
  -d '{"action":"update","productId":"prod_…","journeys":[ … ]}'
```

Changes take effect on the next page load — the config is compiled per request,
so no redeploy is needed.

## Before you trust one

1. Walk the flow yourself and record the exact text at each stage.
2. Verify each proof is absent before, present after.
3. Confirm each `targetName` resolves to exactly one visible control.
4. Run it end to end by voice, and deliberately click the **wrong** thing — the
   step should stay blocked and the recovery should be materially different.
