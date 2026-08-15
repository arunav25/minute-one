# Contributing

Thanks for looking. This is a small codebase with a few strong opinions — the
ground rules below are the ones worth reading before you write code.

## Ground rules

**1. Only the controller advances a step.** No pull request may give the voice
provider, the model, or the host application a way to mark a step passed. If a
change makes it *easier* to advance without evidence, it will be declined even
if it makes a demo smoother. This is the product.

**2. `packages/core` stays vendor-neutral.** It must not import Deepgram, PyAI,
Next.js, React, or anything about products and help centres. If core needs
something from a vendor, the vendor implements an interface core already
declares.

**3. Never commit secrets.** No API keys, connection strings, certificates or
`.env` files. They are gitignored; keep it that way. If you commit one, rotate
it — removing the commit is not enough.

**4. Redaction is not optional.** Anything sent to a model is a redacted
semantic snapshot. Never raw HTML, never form values, never password fields.

**5. Say what is real.** The README's "What is real, and what is not" section is
load-bearing. If your change makes something real, move it up. If you add
scaffolding, say so.

## Setup

```bash
git clone https://github.com/arunav25/minute-one.git
cd minute-one
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3200
npm run dev:https      # required if you are working on voice (mic needs TLS)
```

No key is needed to work on the engine, the console UI, or the verifier — the
mock voice adapter and the local JSON store cover those.

## Before you open a pull request

```bash
npm run typecheck    # strict, all workspaces
npm test             # Vitest
npm run e2e          # Playwright (npx playwright install chromium first)
npm run build        # production build, including the SDK bundle
```

CI runs the first three on every pull request.

If you changed anything in `packages/web` or `packages/voice-*`, run
`npm run build:sdk` and confirm the widget still works on
`/embed-test` — the bundle is a build artifact and a stale one is a
confusing failure.

## Adding a voice provider

1. Create `packages/voice-<vendor>/` with one adapter implementing
   `VoiceAdapter` from `@minute-one/core`.
2. Implement `connect`, `say`, `pushContext`, `respondToTool`,
   `respondToToolError`, `disconnect`, and expose a `VoiceProviderProof`.
3. Report `isRealVoice` honestly. A scripted or fallback mode must never claim to
   be provider audio.
4. Mint credentials **server-side**. The browser gets a short-lived token; the
   long-lived key never leaves the server.
5. Add tests with a fake session — see `packages/voice-deepgram/src/deepgram.test.ts`,
   which pins the outgoing settings shape after a vendor-schema bug took real
   voice down.
6. Update the providers table in the README with its honest status.

## Tests

- **Unit and integration** — Vitest, beside the code. The controller, verifier,
  redaction and origin matching are the load-bearing ones.
- **End to end** — Playwright, driving the real SDK with the mock voice adapter.
- Security-relevant logic (origin matching, redaction, the verification gate)
  needs a test that pins the *attack*, not only the happy path. See
  `src/server/origins.test.ts`.

## Style

- TypeScript, strict. No `any` in new code.
- Comments explain **why**, not what. If a line is surprising, say what would
  break without it.
- Match the surrounding code's naming and idiom.
- User-facing copy avoids internal vocabulary — no selectors, rule names, step
  ids or vendor names in anything a guided user reads.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat: allow wildcard subdomains in origin allowlists
fix: stop the guide advancing before the search has run
docs: document the retrieval failure mode
```

Write the body for someone reading it in six months: what was wrong, why this
fixes it, what you decided not to do.

## Reporting bugs

Open an issue with what you expected, what happened, and the smallest steps to
reproduce. For anything security-related, do **not** open a public issue — see
[SECURITY.md](SECURITY.md).
