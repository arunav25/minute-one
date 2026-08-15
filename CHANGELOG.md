# Changelog

Notable changes to Minute One. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project is pre-1.0
and does not yet publish releases, so entries are grouped by theme rather than
by version.

## [Unreleased]

### Added

- **Open source under MIT**, with contributing, security and architecture docs,
  and CI running typecheck, tests, build, CodeQL and secret scanning.
- **Landing page** at the root — the pitch, the loop, the install snippet, and
  the demo video behind the primary call to action.
- **Multiple journeys per product**, selected from what the user says. "Add a
  number" and "send a message" are different paths, matched on goal phrases with
  the longest match winning.
- **Semantic knowledge base** — help-centre ingest, chunking and embedding into
  NeonDB with pgvector, retrieved mid-conversation through a `search_knowledge`
  tool. Console panels to add sources, train them, and inspect exactly which
  passages a question would retrieve.
- **NeonDB persistence** for products, journeys, knowledge and session events,
  so a deployed instance keeps its state. Local JSON remains the fallback when
  `DATABASE_URL` is unset.
- **Console**: sessions with per-step timelines and provider proof, a users view,
  a retrieval search panel, light and dark themes, and a signed-in account.
- **Widget**: draggable, minimises to an orb that keeps signalling while a call
  is live, transcript that follows the conversation.
- **Wildcard origins** — allowlists accept `https://*.example.com`, matched by
  parsing the origin rather than comparing strings.
- **Selector targets** — a step can point at a control that has no accessible
  name, which real apps are full of.

### Changed

- **The widget speaks to the guided user, not to us.** Removed the speech
  vendor, model string, provider session id, minutes billed, connection state,
  verifier evidence rules, step counter and the link into Minute One's own
  report. That detail moved to the console, where the team that installed the
  guide can act on it.
- **An authored journey now outranks a retrieved article** while a step is open.
  Help articles describe every route a product supports; a journey is the one
  route its team chose and proved.
- **The guide stays on the line when a journey ends**, speaks a closing line per
  outcome, and disconnects only when the user ends the session.
- The persona states that the user is already signed in and inside the product,
  so retrieved articles no longer tell them to log in again.
- Rebranded: the mark is a lowercase **m** on a violet-to-daylight chip.

### Fixed

- **Deepgram rejected the settings message** for any flow that declared a tool.
  A client-side function is declared by omitting `endpoint`; there is no
  `client_side` field, and one unknown key invalidates the whole `think` object.
- **Vercel builds failed** with a missing `next-server.js.nft.json`. Next 16
  defaults to Turbopack, and trace collection runs only on the webpack path.
- **`/minute-one.js` 404'd in production** — the bundle is a build artifact and
  the deploy never generated it.
- **The guide ran ahead of the user** on the contact-search step, because its
  proof (`contact(s)`) was already visible on the unfiltered list.
- **The orb would not open the panel** — three separate causes: reading
  `data-action` from the event target, pointer capture retargeting the click, and
  `preventDefault()` on `pointerdown` suppressing it entirely.
- Re-ingesting a help-centre archive no longer deletes notes written in the
  console.
- Hex HTML entities survived ingest and were read aloud (`you&#x27;ll`).
- The console's theme preference reset on every reload.
