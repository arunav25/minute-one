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

Node 22+, and a PyAI key for real voice.

```bash
npm install
cp .env.example .env.local     # add PYAI_API_KEY
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
npm test          # 41 unit tests
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
@minute-one/voice-pyai    real voice over PyAI Omni.
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

A console-built Voice Agent can supply the voice and language, but never the
verification contract: Minute One keeps sending its own persona and tools per
session, so an agent changes how the guide sounds, not what counts as proof.

## What is real, and what is not

Honesty about state matters more here than a feature list.

**Real, verified end to end**
- PyAI Omni voice. Verified from two origins with a live socket: server `hello`
  (protocol 2), `session_started`, real `call_id`. The overlay always shows which
  provider is carrying the audio.
- Adopting a Voice Agent built in the PyAI console. Set `PYAI_AGENT_ID` and the
  profile resolves on the call: `hello.agent_id` comes back as that agent
  instead of `__unknown__`. It binds from the connect URL's `session_label` —
  minting with the same label does *not* bind it, which is easy to miss because
  both calls accept one. Leave it empty and everything runs as before.
- The verification gate. A wrong action stays blocked and names the missing
  evidence; the correction advances it.
- Spotlight: hugs the target across route and DOM changes, passes clicks through,
  leaves the host DOM untouched, cleans up between steps.
- Origin-locked keys: a product key is refused from an unlisted origin, and no
  voice token is minted for one.
- Journey authoring in the console, compiled to a verified flow.

**Configured, not proven at scale**
- Session events and the report are process-local and reset on restart.
- The product store is a JSON file. Single tenant, unauthenticated.

**Assumed**
- The JustCall journey's labels and success text live in the console-authored
  product, not in code. They were read off the real `get-started.php` page; if
  that page changes, the journey is edited in the console, not the repo.

**Not built**
- Microphone capture has never been exercised in an automated run; the sandbox
  browsers block `getUserMedia`. The code path handles denial explicitly, with a
  distinct notice and no offer of demo mode.
- Host-event and backend-event evidence are typed extension points. Only DOM and
  URL conditions are implemented.
- **No telephony.** The handoff card shows a support number and ends the session
  as partial. Nothing dials, and the wording says so.
- No crawler, no test-account login, no auth, no billing, no multi-tenancy, no
  hosted CDN, no visual flow editor, no browser extension.

**Never**
- Silently swapping PyAI for the mock. A failed connection is shown as a failure;
  demo mode is an explicit choice and stays labelled as a mock.
- The PyAI secret reaching the browser. The page gets a short-lived,
  origin-locked session token.

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
- **Token origin.** A token is locked to the origin that asked for it. An HTTPS
  page cannot use an HTTP-locked token; PyAI refuses the socket with a bare 1006
  and no explanation.

## Licence

None granted. All rights reserved, pending a decision — `package.json` declares
`UNLICENSED` and every package is `private`, so nothing can be published by
accident. Do not redistribute.
