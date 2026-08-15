# Troubleshooting

Failures we actually hit, and what each one turned out to be. Most cost an hour
before the cause was obvious in hindsight.

## Voice

### "Start voice guide" does nothing, or the microphone never prompts

Browsers grant microphone access on **secure origins only**. `npm run dev`
serves plain HTTP.

```bash
npm run dev:https     # generates a local cert, serves over TLS
```

### The panel says "The voice guide couldn't start"

Deliberately vague — a customer can't act on `origin_not_allowed`. The real
reason is always in the browser console:

```
[minute-one] voice connection failed: …
```

Two gates can reject a token mint, and the message names which:

1. **The product's allowed origins** — stored in NeonDB, edited in the console
   under *Settings*. Takes effect immediately, no redeploy.
2. **`DEEPGRAM_ALLOWED_ORIGINS`** — the server's spend gate. An environment
   variable, so it needs a **redeploy** to take effect.

Both accept wildcard subdomains: `https://*.trycloudflare.com`.

### Deepgram rejects the settings message

```
Error parsing client message. Check the agent.think field against the API spec.
```

Deepgram validates strictly and rejects the whole `think` object for one unknown
key. A client-side function is declared by **omitting** `endpoint`; there is no
`client_side` field. Sending one took real voice down for every flow that
declared a tool. Pinned by a test in `packages/voice-deepgram`.

### The video or media won't play locally

Chromium's media pipeline refuses media over a **self-signed certificate**, even
where pages and images load fine. Test media against a real certificate.

## The widget

### Changes to the SDK don't appear

`public/minute-one.js` is a **build artifact**. After editing `packages/web` or
`packages/voice-*`:

```bash
npm run build:sdk
```

Then hard-reload the host page (⌘⇧R) — browsers cache the bundle aggressively.
`npm run build` does the rebuild for you.

### The orb doesn't open the panel

Three separate bugs conspired here; all are fixed, and all are worth knowing if
you touch the overlay's event handling:

- Read `data-action` from `event.target.closest("[data-action]")`, not the
  target. A press on the orb lands on the inlined `<svg>` or a ring.
- **Pointer capture on `pointerdown` retargets the following click** to the
  capturing element. Capture only once movement exceeds the drag threshold.
- **`preventDefault()` on `pointerdown` suppresses the compatibility mouse
  events, including `click`.** Use CSS `user-select` for selection instead.

### The guide runs ahead without waiting

Its proof is already true before the step. See
[journeys.md](architecture/journeys.md#choosing-proof--the-part-that-goes-wrong).

### No spotlight ring

The target could not be resolved — missing, ambiguous, or an icon-only control
with no accessible name. Use `targetSelector`, or add an `aria-label` in the host
app. Verification is unaffected either way.

## The knowledge base

### The guide answers confidently but wrongly

The corpus is missing the article, and search returned its nearest neighbour.
Check with the console's **Search** panel; if the right article isn't there, add
it. A similarity threshold does **not** fix this — see
[knowledge-base.md](architecture/knowledge-base.md#the-failure-mode-to-understand).

### The guide sends the user somewhere the step can't pass

A retrieved article described a different valid route. The persona gives the
authored step precedence while a step is open; if you changed the persona, that
rule is what you removed.

### `Set OPENAI_API_KEY … in the environment`

A bare `node` process doesn't read `.env.local` — that's a Next.js behaviour.
The scripts load it explicitly via `@next/env`; if you wrote a new script, do the
same.

### Console notes vanished after an ingest

Fixed: ingest now deletes only imported rows and leaves `kb_`-prefixed console
notes alone. If notes show `Untrained`, press **Retrain agent**.

## Build and deploy

### Vercel build fails: `ENOENT … next-server.js.nft.json`

Next 16 defaults `next build` to Turbopack, and `@vercel/nft` trace collection
runs **only on the webpack path** — so the file Vercel's post-build step opens is
never written. The build script uses `next build --webpack` for this reason.

### `/minute-one.js` 404s in production

The bundle is gitignored (correctly — it's a build artifact). `npm run build`
runs `build:sdk` first so the deploy generates it.

### The deployed console is empty

`DATABASE_URL` isn't set in the Vercel environment. Without it, the stores fall
back to a local JSON file, and a serverless filesystem is ephemeral — nothing
persists. Set it, then redeploy.

### Env changes don't take effect

Vercel environment variables apply to a **new build**. Redeploy after changing
one. Data in NeonDB (products, journeys, origins) is live immediately.

## Tunnels

Cloudflare quick tunnels get a **new random hostname on every restart**. Rather
than re-editing two allowlists each time, both accept
`https://*.trycloudflare.com`.

Be aware of what that means: any tunnel can then mint voice tokens against your
public product key, and product keys are public by design. Fine for a demo, not
something to leave switched on.
