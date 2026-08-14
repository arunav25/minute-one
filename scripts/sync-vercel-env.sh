#!/usr/bin/env bash
#
# Push the environment this app needs from .env.local into a Vercel project.
#
#   ./scripts/sync-vercel-env.sh https://minute-one-ten.vercel.app [production|preview]
#
# Values are read from .env.local on this machine and piped straight into the
# Vercel CLI. Nothing is printed but variable names, so a shared terminal or a
# pasted log never carries a secret.
#
# Two rules are applied on the way, because a blind copy of a development file
# into production is wrong in specific ways:
#
#   * MINUTE_ONE_CAROOT is skipped. It points at a local development
#     certificate authority that exists only on this machine.
#   * The *_ALLOWED_ORIGINS allowlists are replaced with the deployed origin.
#     Locally they name localhost; shipping that verbatim means the deployed
#     page asks for a voice token, fails the origin check and 403s.
#
# Requires: the Vercel CLI, authenticated, with this directory linked to the
# project (`vercel login` then `vercel link`).
set -euo pipefail

PROD_URL="${1:-}"
TARGET="${2:-production}"
ENV_FILE=".env.local"

if [ -z "$PROD_URL" ]; then
  echo "usage: $0 <deployed-url> [production|preview|development]" >&2
  echo "   eg: $0 https://minute-one-ten.vercel.app" >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "The Vercel CLI is not installed. Install it, then re-run:" >&2
  echo "  npm i -g vercel && vercel login && vercel link" >&2
  exit 1
fi

if [ ! -d .vercel ]; then
  echo "This directory is not linked to a Vercel project. Run: vercel link" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE here — nothing to read." >&2
  exit 1
fi

echo "Syncing $ENV_FILE → Vercel ($TARGET). Values are never printed."
echo

count=0
while IFS= read -r line || [ -n "$line" ]; do
  # Skip blanks and comments.
  case "$line" in ''|'#'*) continue ;; esac
  case "$line" in *=*) : ;; *) continue ;; esac

  name="${line%%=*}"
  value="${line#*=}"

  # Trim whitespace around the name; tolerate `export FOO=`.
  name="${name#export }"
  name="$(printf '%s' "$name" | tr -d '[:space:]')"

  # Strip one matching pair of surrounding quotes, if present.
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac

  case "$name" in
    MINUTE_ONE_CAROOT)
      echo "  skip  $name (local development certificate authority)"
      continue
      ;;
    DEEPGRAM_ALLOWED_ORIGINS|PYAI_ALLOWED_ORIGINS)
      value="$PROD_URL"
      echo "  set   $name → $PROD_URL (replaced localhost)"
      ;;
    *)
      echo "  set   $name"
      ;;
  esac

  [ -z "$value" ] && { echo "        (empty in $ENV_FILE — skipped)"; continue; }

  # Replace rather than append: `vercel env add` on an existing name in the
  # same target errors, and a stale value silently winning would be worse.
  vercel env rm "$name" "$TARGET" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" "$TARGET" >/dev/null
  count=$((count + 1))
done < "$ENV_FILE"

echo
echo "$count variable(s) set on $TARGET."
echo "Environment changes only reach a new build — redeploy with:"
echo "  vercel --prod"
