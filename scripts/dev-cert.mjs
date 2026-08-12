import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Produce a certificate for local HTTPS.
 *
 * Needed because a host page served over HTTPS — JustCall on
 * https://app.justcall.local, for instance — cannot load a script from an HTTP
 * origin; the browser blocks it as mixed content.
 *
 * Next's own `--experimental-https` runs `mkcert -install`, which writes to the
 * system trust store and so prompts for a password; when that prompt is
 * declined it falls back to HTTP without failing, which looks like it worked.
 *
 * Two routes, in order of preference:
 *
 *   1. Issue a certificate from a local mkcert CA that the system already
 *      trusts. Issuing does not touch the trust store, so there is no password
 *      prompt, and the result works in the browser immediately. A machine can
 *      have several mkcert CAs and only some of them trusted, so each candidate
 *      is checked with `security verify-cert` rather than assumed — an
 *      untrusted CA produces a certificate that looks fine and is rejected by
 *      every browser.
 *   2. Otherwise fall back to a self-signed certificate from openssl. Also no
 *      password, but it costs one manual trust step: open https://localhost:3200
 *      and accept the warning, or cross-origin script loads stay blocked.
 *
 * Set `MINUTE_ONE_CAROOT` (environment or .env.local) to point at the directory
 * holding the `rootCA.pem` / `rootCA-key.pem` you want to sign with. On a
 * machine that already runs another local HTTPS stack, that stack's CA is the
 * one to reuse — its certificates are trusted, so ours will be too.
 */
const dir = join(process.cwd(), "certificates");
const keyFile = join(dir, "localhost-key.pem");
const certFile = join(dir, "localhost.pem");

if (existsSync(keyFile) && existsSync(certFile)) {
  console.log("certificate already present in certificates/");
  process.exit(0);
}

mkdirSync(dir, { recursive: true });

/** The mkcert binary Next downloads for its own `--experimental-https`. */
function findMkcert() {
  const cache = join(homedir(), "Library", "Caches", "mkcert");
  for (const name of [
    "mkcert-v1.4.4-darwin-arm64",
    "mkcert-v1.4.4-darwin-amd64",
    "mkcert-v1.4.4-linux-amd64",
  ]) {
    const path = join(cache, name);
    if (existsSync(path)) return path;
  }
  return null;
}

/** `MINUTE_ONE_CAROOT` from the environment, or from .env.local if set there. */
function configuredCaRoot() {
  if (process.env.MINUTE_ONE_CAROOT) return process.env.MINUTE_ONE_CAROOT;
  try {
    const line = readFileSync(join(process.cwd(), ".env.local"), "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("MINUTE_ONE_CAROOT="));
    if (line) return line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch {
    // no .env.local, or unreadable — the default CAROOT is tried next
  }
  return null;
}

/** Does the system actually trust a certificate chain? */
function isTrusted(path) {
  try {
    execFileSync("security", ["verify-cert", "-c", path], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

const mkcert = findMkcert();
const caRoots = [
  configuredCaRoot(),
  join(homedir(), "Library", "Application Support", "mkcert"),
].filter((root) => root && existsSync(join(root, "rootCA-key.pem")));

for (const caRoot of mkcert ? caRoots : []) {
  try {
    execFileSync(
      mkcert,
      ["-key-file", keyFile, "-cert-file", certFile, "localhost", "127.0.0.1", "::1"],
      { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, CAROOT: caRoot } }
    );
  } catch (error) {
    console.warn(`mkcert could not issue from ${caRoot}:`);
    console.warn(String(error.stderr ?? error.message).trim());
    continue;
  }

  if (isTrusted(certFile)) {
    console.log(`issued certificates/localhost.pem from the CA at ${caRoot}`);
    console.log("that CA is already trusted by this machine — no further steps");
    process.exit(0);
  }

  console.warn(`the CA at ${caRoot} is not trusted by this machine — discarding`);
  rmSync(keyFile, { force: true });
  rmSync(certFile, { force: true });
}

const config = join(dir, "openssl.cnf");
writeFileSync(
  config,
  `[req]
distinguished_name = dn
x509_extensions = ext
prompt = no

[dn]
CN = localhost
O = Minute One local development

[ext]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @san

[san]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
`
);

try {
  execFileSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-sha256",
      "-days", "365", "-nodes",
      "-keyout", keyFile,
      "-out", certFile,
      "-config", config,
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
} catch (error) {
  console.error("could not generate a certificate with openssl:");
  console.error(String(error.stderr ?? error.message));
  process.exit(1);
}

console.log("wrote certificates/localhost.pem and certificates/localhost-key.pem");
console.log("open https://localhost:3200 once and accept the warning to trust it");
