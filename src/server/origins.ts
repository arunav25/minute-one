/**
 * Origin allowlist matching, with wildcard subdomains.
 *
 * An entry is either an exact origin — `https://app.example.com` — or a
 * wildcard host — `https://*.trycloudflare.com`, which matches any single- or
 * multi-label subdomain of that suffix over that exact scheme.
 *
 * Matching parses the origin rather than comparing strings, because the
 * obvious `endsWith(".trycloudflare.com")` accepts
 * `https://trycloudflare.com.attacker.example` and
 * `https://evil.example/?x=.trycloudflare.com`. This is the gate in front of
 * minting voice credit, so it is worth doing on structure, not on substrings.
 *
 * A wildcard never matches the bare apex (`https://trycloudflare.com`), and the
 * scheme must match exactly: `https://*.example.com` will not admit an
 * `http://` caller.
 */

export function originMatches(origin: string, pattern: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  if (p === origin) return true;
  if (!p.includes("*")) return false;

  // Only a leading `*.` in the host is supported. Anything else (a `*` in the
  // middle of a label, a wildcard in the scheme or the port) is rejected rather
  // than guessed at.
  const m = p.match(/^(https?):\/\/\*\.([^/:*]+)$/i);
  if (!m) return false;
  const [, scheme, suffix] = m;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  // An origin carries no path; anything with one is not an origin we issued.
  if (url.protocol !== `${scheme.toLowerCase()}:`) return false;
  if (url.port) return false;
  if (origin !== `${url.protocol}//${url.hostname}`) return false;

  const host = url.hostname.toLowerCase();
  const base = suffix.toLowerCase();
  // `.` prefix is what stops `trycloudflare.com.attacker.example` matching, and
  // the length check is what stops the bare apex matching.
  return host.endsWith(`.${base}`) && host.length > base.length + 1;
}

/** True when any entry admits this origin. An empty list admits nothing. */
export function originAllowed(
  origin: string,
  patterns: readonly string[]
): boolean {
  return patterns.some((p) => originMatches(origin, p));
}

/** Parse a comma-separated allowlist from configuration. */
export function parseOrigins(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
