# Minute One — brand assets

The mark is a **lowercase m**, drawn the way you would write it: one stem, two
arches, round terminals. Minute One speaks *alongside* somebody else's product,
on their screen, next to their brand — so the mark stays a letter rather than a
symbol arguing for attention it has not earned. It is legible at 16px, which is
the size it is usually seen at.

The chip warms from violet to daylight. Violet is not decoration: it is the
colour of the ring the guide draws around the control it is pointing at, so the
mark and the thing the user actually sees agree. The warm end is where they come
out.

Open `/brand/` in the running app for the full sheet.

## Files

| File | Use |
| --- | --- |
| `logo-lockup.svg` | Primary. Mark + wordmark, for light backgrounds. |
| `logo-lockup-dark.svg` | Primary, for dark backgrounds. |
| `logo-lockup-caps.svg` | Uppercase cut — matches the `MINUTE ONE` label in the widget header. |
| `logo-lockup-stacked.svg` | Wordmark with the `VERIFIED ONBOARDING` descriptor. |
| `logo-lockup-mono.svg` | Single colour, `currentColor`. |
| `logo-mark.svg` | Mark alone — the chip, on any background. |
| `logo-mark-dark.svg` | Mark alone, for dark backgrounds. |
| `logo-mark-mono.svg` | The letter alone in `currentColor`, no chip. For embossing, favicons on tinted chrome, single-colour print. |
| `logo-mark-animated.svg` | The letter draws itself in one stroke. |
| `icon.svg` | App icon. |
| `favicon.svg` | Favicon — same mark, heavier stroke so the counters survive 16px. |
| `png/` | Rasterised versions. |

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Chip gradient | `#7A50F5` → `#A487FF` → `#F5E6D3` | The mark's chip. Nothing else. |
| Violet | `#7C5CFF` | Accent on light. The widget's target-highlight colour. |
| Violet (on dark) | `#9B7BFF` | Accent on dark, where `#7C5CFF` sits too close to the background. |
| Ink | `#16141F` | Wordmark on light. |
| Ink (on dark) | `#ECECEC` | Wordmark on dark. |
| Dim | `#6B6880` | Secondary type. |

## Rules

- Clear space on every side is the chip's corner radius — about a quarter of the
  mark's height.
- The letter is always white on the chip. Never recolour it, and never set the
  chip in a flat violet: the gradient is the identity.
- Never stretch the chip. The corner radius is proportional; scale it whole.
- Below 20px use `favicon.svg`, not `icon.svg` — the lighter stroke closes up.
- The console is dark and near-monochrome by design. The mark is the one place
  brand colour appears there; that is deliberate, so do not add more.
- Green means verified, and only that. It is a semantic colour, not a brand one —
  never use it in the mark or the lockup.
