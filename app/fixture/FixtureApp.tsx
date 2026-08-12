"use client";

import { AVAILABLE_NUMBERS, useFixture } from "./fixture-state";

/**
 * A JustCall-style example product.
 *
 * Markup is ARIA-first — roles, accessible names, `role="status"` notices,
 * `role="dialog"` panels — because that is exactly what the observer reads.
 * Nothing here imports the engine; the guide observes it from outside, the way
 * it would observe a real product.
 */
export function FixtureApp() {
  const f = useFixture();

  return (
    <div className="fx">
      <nav className="fx-nav" aria-label="Main">
        <div className="fx-brand">JustCall</div>
        <button
          data-testid="nav-phone-numbers"
          aria-current={f.screen === "phone-numbers" ? "true" : undefined}
          onClick={() => f.go("phone-numbers")}
        >
          Phone Numbers
        </button>
        <button
          data-testid="nav-settings"
          aria-current={f.screen === "settings" ? "true" : undefined}
          onClick={() => f.go("settings")}
        >
          Settings
        </button>
        <button data-testid="nav-dashboard" onClick={() => f.go("dashboard")}>
          Dashboard
        </button>
        <button className="fx-reset" data-testid="fixture-reset" onClick={f.reset}>
          Reset demo
        </button>
      </nav>

      <main className="fx-main">
        {f.notice && (
          <div role="status" data-notice data-kind={f.notice.kind} className="fx-notice">
            {f.notice.text}
          </div>
        )}

        {f.screen === "dashboard" && (
          <section>
            <h1>Dashboard</h1>
            <p className="fx-muted">
              Welcome. Set up your first number to start making calls.
            </p>
          </section>
        )}

        {f.screen === "settings" && (
          <section>
            <h1>Settings</h1>
            <p className="fx-muted">
              Account preferences. Nothing here provisions a number.
            </p>
          </section>
        )}

        {f.screen === "phone-numbers" && (
          <section>
            <div className="fx-head">
              <h1>Phone Numbers</h1>
              <button data-testid="add-number" onClick={f.openDialog}>
                Add Number
              </button>
            </div>

            {f.provisioned ? (
              <table className="fx-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Team</th>
                  </tr>
                </thead>
                <tbody>
                  <tr data-testid="provisioned-row">
                    <td>{f.provisioned.number}</td>
                    <td>{f.provisioned.team}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="fx-muted">No numbers yet.</p>
            )}
          </section>
        )}

        {f.dialogOpen && (
          <div className="fx-scrim">
            <div role="dialog" aria-label="Add a number" className="fx-dialog">
              <h2>Add a number</h2>

              {!f.chosenNumber ? (
                <>
                  <p className="fx-muted">Available numbers</p>
                  <ul className="fx-list">
                    {AVAILABLE_NUMBERS.map((n) => (
                      <li key={n}>
                        <span>{n}</span>
                        <button
                          data-testid={`choose-${n.replace(/\D/g, "")}`}
                          onClick={() => f.chooseNumber(n)}
                        >
                          Choose this number
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <h3>Review</h3>
                  <p className="fx-chosen">{f.chosenNumber}</p>

                  <p className="fx-label">Assign to team</p>
                  <div className="fx-teams" role="group" aria-label="Assign to team">
                    {(["Sales", "Support"] as const).map((team) => (
                      <button
                        key={team}
                        data-testid={`team-${team.toLowerCase()}`}
                        aria-selected={f.team === team}
                        data-selected={f.team === team}
                        className={f.team === team ? "on" : ""}
                        onClick={() => f.setTeam(team)}
                      >
                        {team}
                      </button>
                    ))}
                  </div>

                  <div className="fx-actions">
                    <button data-testid="cancel-setup" onClick={f.closeDialog}>
                      Cancel
                    </button>
                    <button
                      data-testid="confirm-setup"
                      // Enabled whenever a team is chosen — including the wrong
                      // one. The product must not prevent the mistake; the
                      // guide has to notice it.
                      disabled={!f.team}
                      aria-disabled={!f.team}
                      onClick={f.confirm}
                    >
                      Confirm setup
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
