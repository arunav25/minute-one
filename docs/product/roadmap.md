# Roadmap

Where Minute One is, and what comes next. Status is written against what has
been **verified running**, not what has been written.

## Done

**The engine**
- Session controller: instruct → observe → verify → advance or recover
- Verifier with `all` / `any` / `not` rule groups; an empty rule is unproven
- Bounded recovery — location, recognition, reset — each materially different
- Budgets: session time, voice minutes, step count, attempts per step
- Four terminal states, written to the log before the UI shows them

**The widget**
- Shadow-DOM overlay: draggable, minimises to an orb that signals a live call
- Spotlight resolving by role + name, test id, or CSS selector
- DOM observer with redaction — no raw HTML, no form values, no secrets
- Transcript that follows the conversation
- Boots from one script tag and a public product key

**Voice**
- Deepgram Voice Agent end to end: token mint, live session, barge-in,
  transcripts, client-side tool calls
- Provider proof (provider, model, session id, minutes, real vs mock) recorded
  on every session

**Knowledge**
- Help-centre ingest → chunk → embed → NeonDB + pgvector
- `search_knowledge` retrieval mid-conversation
- Console training for text, Q&A and file sources
- Retrieval inspector in the console, showing scores

**Journeys**
- Multiple journeys per product, selected from natural speech
- Steps declaring targets and on-screen proof

**Console**
- Products, data sources, retrieval search, journey editing, install snippet,
  sessions with per-step timelines, users
- Light and dark themes

**Platform**
- NeonDB persistence for products, journeys, knowledge and events
- Origin allowlists with wildcard subdomains
- Deployed on Vercel; landing page, console and demo host page live

## Next

- **Verify the PyAI adapter.** Written against the docs, never run against a
  live account. Until then it is not a supported provider.
- **Multi-journey editing in the console.** The API supports several journeys
  per product; the editor still assumes one and could clobber the list.
- **Publish the widget** to npm so hosts can pin a version.
- **Journey authoring aids** — check a proof is absent-before / present-after
  from the console, rather than by hand in a browser console.

## Then

- **Authentication and multi-tenancy.** The console is unauthenticated and
  single-tenant today. This is the gate before anyone else's data is in it.
- **Phone continuation.** Accepting help currently shows a number and a session
  reference. A real callback needs a telephony leg.
- **Design partners** across adjacent SaaS — the wedge is any product whose
  first session is hard.

## Deliberately not planned

- Screenshot or vision-based navigation
- An agent that clicks, types or purchases on the user's behalf
- A general-purpose browser agent
- Emotion classification for stuck detection — the signals are inspectable ones
  (timeouts, unchanged fingerprints, error notices, explicit phrases)

Each of these would trade the product's one defensible claim — that nothing
advances without proof — for a demo that looks more magical and is less true.
