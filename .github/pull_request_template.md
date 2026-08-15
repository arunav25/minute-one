## What this changes

<!-- One or two sentences. What was wrong, and what this does about it. -->

## Why

<!-- The reasoning. If you decided against an obvious alternative, say why. -->

## How it was verified

<!-- What you actually ran or clicked. "Tests pass" is not verification of a
     voice or browser change — say what you observed. -->

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Exercised in a browser (say where, and what you saw)

## Ground rules

- [ ] Nothing but the controller can advance a step
- [ ] `packages/core` still imports no vendor, framework or product concept
- [ ] No secrets, keys or connection strings in the diff
- [ ] If this changed `packages/web` or `packages/voice-*`, the SDK bundle was
      rebuilt and the widget re-checked
- [ ] README's "What is real, and what is not" still tells the truth
