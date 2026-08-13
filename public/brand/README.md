# Minute One — brand assets

The mark is a **gate that only proof opens**: a closed ring with a single gap,
and a check that breaks out through it. It is the product's one rule drawn once —
nothing advances until the result is verified.

Open `/brand/` in the running app for the full sheet.

## Files

| File | Use |
| --- | --- |
| `logo-lockup.svg` | Primary. Mark + wordmark, for light backgrounds. |
| `logo-lockup-dark.svg` | Primary, for dark backgrounds. |
| `logo-lockup-caps.svg` | Uppercase cut — matches the `MINUTE ONE` label in the widget header. |
| `logo-lockup-stacked.svg` | Wordmark with the `VERIFIED ONBOARDING` descriptor. |
| `logo-lockup-mono.svg` | Single colour, `currentColor`. |
| `logo-mark.svg` | Mark alone, light backgrounds. |
| `logo-mark-dark.svg` | Mark alone, dark backgrounds. |
| `logo-mark-mono.svg` | Mark alone, `currentColor`. |
| `logo-mark-animated.svg` | The gate draws closed, then the proof breaks through. |
| `icon.svg` | App icon — violet gradient chip. |
| `favicon.svg` | Favicon. The ring is dropped; at 16px a hairline ring turns to mush. |
| `png/` | Rasterised versions, transparent background. |

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Violet | `#7C5CFF` | Accent on light. Already the widget's target-highlight colour. |
| Violet (on dark) | `#9B7BFF` | Accent on dark, where `#7C5CFF` sits too close to the background. |
| Gradient | `#9C7CFF` → `#5C34E0` | App icon chip only. |
| Ink | `#16141F` | Wordmark and ring on light. |
| Ink (on dark) | `#E9E7F2` | Wordmark and ring on dark. |
| Dim | `#6B6880` | Secondary type. |

## Rules

- Clear space on every side is the radius of the ring — about half the mark's height.
- Never recolour the check to anything but the violet, and never put the ring in violet;
  the two-tone split is what makes the break-out legible.
- Below ~24px use `favicon.svg`, not the mark. The ring's gap stops resolving first,
  and a check that no longer breaks *out* of anything is just a checkmark.
- The `-mono` files inherit CSS `color`, so they only pick it up when inlined into
  the DOM. Referenced through `<img src>` they render black.

## Regenerating the PNGs

```bash
node scripts/build-brand-png.mjs
```

Renders through Playwright's Chromium rather than a standalone SVG rasteriser: the
lockups set type in the system UI font, and only a real browser resolves that stack
the same way the shipped SVG resolves it in a page. Edit an SVG, re-run, done.

## The wordmark's font

The lockups set live text in the system UI stack (SF Pro on macOS, Segoe UI on
Windows), matching the app's own type. Each `<text>` is pinned with `textLength`,
so the lockup keeps its exact width everywhere even when the resolved font differs
slightly. If you ever need a lockup that cannot shift at all — a print run, an
embedded font-less renderer — use a PNG from `png/`.
