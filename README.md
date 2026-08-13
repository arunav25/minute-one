# Minute One

A voice onboarding guide that refuses to advance until the intended result is
actually visible on the page.

Guided tours advance because a script says so. Minute One speaks one instruction,
observes the page afterwards, checks a declared success condition, and stays put
until that condition is met. A wrong action stays blocked and the recovery is
phrased differently each time. The model can rephrase, answer questions and
explain a failure — it cannot decide that a step passed. Only the verification
gate advances a step.

It ships as one script tag. The host application changes nothing else.

---

## Setup

Node 22+, and a Deepgram API key for real voice.

```bash
npm install
cp .env.example .env.local     # add DEEPGRAM_API_KEY
npm run dev                    # http://localhost:3200
```

`npm run dev:https` instead if you need to embed on an HTTPS host page — a page
served over HTTPS cannot load a script from HTTP. It issues a certificate from a
local CA the machine already trusts, and verifies that trust rather than assuming
it; see `scripts/dev-cert.mjs`.

Opening the app puts you in the console:

1. **Create a product** — the app you want guided. You get a key, `mo_pk_…`.
2. **Knowledge** — everything the guide may answer from. It says it does not know
   rather than inventing.
3. **Journey** — the steps to verify. Each needs an instruction and a success
   condition that is only true *after* the action.
4. **Install snippet** — paste one tag into the host app.

```html
<script src="http://localhost:3200/minute-one.js"
        data-product-key="mo_pk_…"></script>
```

To attribute sessions to real users, set the settings object before the tag:

```html
<script>
  window.minuteOneSettings = {
    productKey: "mo_pk_…",
    user: { id, email, name, createdAt, locale },
    company: { id, name, meta: { plan: "enterprise" } },
  };
</script>
<script src="http://localhost:3200/minute-one.js"></script>
```

Identity is reported with sessions and **never added to the voice context** — the
guide does not speak your users' names or email addresses back to them.

```bash
npm test          # 48 unit tests
npm run typecheck
npm run e2e       # 5 browser tests, real DOM and overlay
```

The browser tests run voice on the mock, requested explicitly with
`/embed-test?voice=mock` — they have no microphone. Point them at an
already-running server with `MINUTE_ONE_BASE_URL=https://localhost:3200 npm run e2e`.

## Architecture

```
@minute-one/core          the engine: controller, verification gate, bounded
                          retries, budgets, terminal outcomes, session events.
                          Knows nothing about any product or voice provider.
@minute-one/web           the embeddable SDK: init/start/track/getStatus/destroy,
                          DOM + route observation, Shadow DOM overlay,
                          spotlight, microphone permission, redaction.
@minute-one/voice-deepgram
                          real browser voice over Deepgram Voice Agent.
@minute-one/voice-pyai    retained provider adapter; not selected by default.
@minute-one/voice-mock    tests, and an explicitly labelled offline demo.
app/, src/server/         console, config and session endpoints, event store.
app/embed-test/           a generic demo product (Acme Scheduling) with the
                          guide mounted, for trying it locally and for the
                          browser tests.
```

The journey is **manifest-authoritative**: the flow owns step order, semantic
target descriptions, success conditions, retry limits and terminal outcomes. Page
context is **runtime-derived**: URL, headings, controls, dialogs, notices and
errors are read live, and targets are located from semantic descriptions rather
than brittle selectors.

Four classes of evidence are defined: DOM condition, URL condition, host
application event, backend-confirmed event.

Deepgram supplies listening, reasoning and speech, but never the verification
contract. Minute One sends the authored tools and current page context to the
voice session. Only the local controller can mark a step successful.

## What is real, and what is not

Honesty about state matters more here than a feature list.

**Implemented and verified by local tests**
- Deepgram Voice Agent is the default real provider. The browser adapter uses
  the official `@deepgram/agents` SDK for microphone input, streamed audio,
  transcripts, barge-in, prompt updates and client-side function calls. The
  overlay always shows which provider is carrying the audio.
- `/api/minute-one/session` exchanges the server-only `DEEPGRAM_API_KEY` for a
  short-lived bearer token. Product origins and the optional global spend gate
  are checked before the Deepgram request.
- The verification gate. A wrong action stays blocked and names the missing
  evidence; the correction advances it.
- Spotlight: hugs the target across route and DOM changes, passes clicks through,
  leaves the host DOM untouched, cleans up between steps.
- Origin-locked keys: a product key is refused from an unlisted origin, and no
  voice token is minted for one.
- Journey authoring in the console, compiled to a verified flow.

**Needs a credentialed smoke test**
- A live Deepgram browser session, including microphone capture, first audio,
  transcript delivery, function-call round trip and reconnect. Unit tests cover
  the adapter boundary and token route, but this repository run did not have a
  real `DEEPGRAM_API_KEY` or microphone.

**Configured, not proven at scale**
- Session events and the report are process-local and reset on restart.
- The product store is a JSON file. Single tenant, unauthenticated.

**Assumed**
- The JustCall journey's labels and success text live in the console-authored
  product, not in code. They were read off the real `get-started.php` page; if
  that page changes, the journey is edited in the console, not the repo.

**Not built**
- Microphone capture has not been exercised in an automated run; the sandbox
  browsers block `getUserMedia`. The code path handles denial explicitly, with a
  distinct notice and no offer of demo mode.
- Host-event and backend-event evidence are typed extension points. Only DOM and
  URL conditions are implemented.
- **No telephony.** The handoff card shows a support number and ends the session
  as partial. Nothing dials, and the wording says so.
- No crawler, no test-account login, no auth, no billing, no multi-tenancy, no
  hosted CDN, no visual flow editor, no browser extension.

**Never**
- Silently swapping Deepgram for the mock. A failed connection is shown as a failure;
  demo mode is an explicit choice and stays labelled as a mock.
- The Deepgram API key reaching the browser. The page gets a short-lived bearer
  token only after the server validates the request origin.

## Reference integration

There is no localhost JustCall lookalike — the real integration runs on the
actual app. `app/get-started.php` in the JustCall monolith loads the script,
gated to a `*.justcall.local` host and to a key present in `localStorage`, so
nothing is committed and customers cannot be affected. The generic Acme
Scheduling page at `/embed-test` is the throwaway surface for trying the guide
without that stack. Two things a real host integration
runs into, both worth knowing before you try your own:

- **Content-Security-Policy.** The host's `script-src` and `connect-src` must
  name the Minute One origin, or the browser refuses both the script and its
  config fetch. It looks identical to a certificate problem and is not one.
- **Token origin.** The server validates the page's `Origin` before minting a
  temporary Deepgram token. Add every real host origin to the product allowlist
  and, when used, `DEEPGRAM_ALLOWED_ORIGINS`.

## Licence

None granted. All rights reserved, pending a decision — `package.json` declares
`UNLICENSED` and every package is `private`, so nothing can be published by
accident. Do not redistribute.
