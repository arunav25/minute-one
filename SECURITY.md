# Security

## Reporting a vulnerability

Email **arunav@saaslabs.co** with what you found, how to reproduce it, and what
an attacker could do with it. Please do not open a public issue.

Expect an acknowledgement within three working days. We will tell you what we
found, what we are changing, and when it ships. If you would like credit in the
release notes, say so.

## Scope

In scope: the engine, the embeddable widget, the server API routes, the console,
and the ingest and seeding scripts in this repository.

Out of scope: the third-party providers themselves (report those to Deepgram,
OpenAI or Neon), and the deliberate limitations listed below.

## Design

**Provider keys never reach the browser.** The long-lived Deepgram key is used
only in a server-to-server exchange. The browser receives a short-lived bearer
token, and the key is not present in any bundle.

**Two gates gate the token mint.** `/api/minute-one/session` checks the calling
origin against (1) the product's own allowlist and (2) the server's
`DEEPGRAM_ALLOWED_ORIGINS` spend gate. Matching parses the origin rather than
comparing strings, so `https://trycloudflare.com.attacker.example` cannot pass a
`https://*.trycloudflare.com` rule. Those cases are pinned in
`src/server/origins.test.ts`.

**The public product key selects context, not credit.** `mo_pk_…` is public by
design — it lives in the page source of every host. It fetches a product's
persona and journeys. It cannot mint voice on its own.

**The page snapshot is redacted before it leaves the observer.** Visible
elements only; roles, accessible names, headings, dialogs and notices. Never raw
HTML, never form values, never password fields. Phone numbers, email addresses,
API keys and card numbers are scrubbed from text.

**Identity is reported, not spoken.** What a host tells us about the signed-in
user is attached to session events for the console. It is never added to the
voice context.

**Sessions are bounded.** Time, voice minutes, total steps and attempts per step
all have ceilings, and exhausting one ends the session as `deadline`.

**The embedding key stays on the server.** The agent's `search_knowledge` tool
calls the Minute One server, which embeds the query. The key is never in the
browser.

## Known limitations

These are deliberate for the current stage and **must** be understood before
running this anywhere real:

- **The console is unauthenticated and single-tenant.** Anyone who can reach it
  can read and change products, journeys and knowledge. Do not expose it
  publicly. Authentication is the gate before multi-tenancy.
- **`/api/minute-one/products` is unauthenticated** for the same reason. It is
  the one endpoint that must not be publicly reachable.
- **A wildcard origin is a spend decision.** `https://*.trycloudflare.com` lets
  any Cloudflare quick tunnel mint voice tokens against your public product key.
  Convenient for a demo; remove it afterwards.
- **Journey and knowledge content is trusted input.** Whoever can author a
  journey can make the guide say anything. Treat authoring as a privileged
  action.

## Handling keys

- Keys live in `.env.local` (gitignored) or your host's environment. Never in
  code, never in a commit.
- `scripts/sync-vercel-env.sh` pipes values from your machine into the Vercel
  CLI and prints only variable names, so a shared terminal or a pasted log never
  carries a secret.
- If a key is ever committed, **rotate it**. Removing the commit is not enough —
  assume it was scraped.
