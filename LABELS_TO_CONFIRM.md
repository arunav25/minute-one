# Labels to confirm

Everything below is **assumed**, not verified against a real JustCall account.
It was chosen to mirror a plausible activation flow so the engine could be built
and demonstrated end to end.

All of it lives in one file: [`src/apps/justcall/landmarks.ts`](src/apps/justcall/landmarks.ts).
Confirming these is an edit to that file — no engine code changes.

## How to confirm

1. Open the real JustCall staging account.
2. Walk the "set up a number for a sales team" journey once, slowly.
3. For each row below, write down what the product actually says and where.
4. Update `landmarks.ts`, then set `LANDMARK_PROVENANCE.status` to `"confirmed"`.
5. Run `npm run test` and `npm run e2e` — the fixture tests still pass, because
   they assert engine behaviour, not the label strings.

## Routes

| Key | Assumed | Confirmed value | Notes |
|---|---|---|---|
| `routes.dashboard` | `/fixture` | | Landing route after login |
| `routes.phoneNumbers` | `/fixture/phone-numbers` | | Number management |
| `routes.numberSetup` | `/fixture/phone-numbers/new` | | May be a dialog, not a route |

## Navigation

| Key | Assumed | Confirmed value | Notes |
|---|---|---|---|
| `nav.phoneNumbers` | "Phone Numbers" | | Exact sidebar label |
| `nav.settings` | "Settings" | | The decoy in the wrong-action demo |

## Controls

| Key | Assumed | Confirmed value | Notes |
|---|---|---|---|
| `controls.addNumber` | "Add Number" | | Could be "Buy Number" |
| `controls.country` | "Country" | | |
| `controls.chooseNumber` | "Choose this number" | | |
| `controls.assignTeam` | "Assign to team" | | |
| `controls.teamSales` | "Sales" | | Team names are tenant-specific |
| `controls.teamSupport` | "Support" | | Any second team works |
| `controls.confirm` | "Confirm setup" | | Could be "Buy" / "Activate" |

## Text landmarks

| Key | Assumed | Confirmed value | Notes |
|---|---|---|---|
| `text.phoneNumbersHeading` | "Phone Numbers" | | |
| `text.setupDialog` | "Add a number" | | Dialog accessible name |
| `text.reviewHeading` | "Review" | | |
| `text.successNotice` | "Number is live" | | Must be the real toast text |

## Two things to check while you are in there

**Is the final step billable?** The flow marks `confirm-setup` as
`sideEffect: "creates"`. If confirming actually purchases a number, do not run
the live demo against it — use a reserved number or a resettable staging route.

**Does a success toast really appear?** The final step deliberately requires two
independent signals — the notice *and* the resulting row. If the real product
shows no toast, replace that rule with another independent signal (an API/state
check, or the number appearing in the list with the team attached). Do not
weaken it to a single signal: that would let a click alone complete the journey,
which is the one thing this product exists to prevent.
