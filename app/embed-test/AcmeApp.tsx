"use client";

import { useState } from "react";

/**
 * Acme Scheduling — a stand-in "beta product" for the demo surface.
 *
 * Markup is ARIA-first — roles, accessible names, a `role="status"` notice, a
 * `role="dialog"` panel — because that is exactly what the observer reads.
 * Nothing here imports the engine; the guide observes it from the outside, the
 * way it would observe any real product a customer embedded the script on.
 *
 * The product deliberately lets you pick the wrong team and still confirm. The
 * mistake is allowed on purpose — catching it is the guide's job, not the
 * product's.
 */
type Team = "Sales" | "Support" | null;

export function AcmeApp() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [team, setTeam] = useState<Team>(null);
  const [booked, setBooked] = useState<{ slot: string; team: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = () => {
    setPanelOpen(false);
    setSlot(null);
    setTeam(null);
    setBooked(null);
    setNotice(null);
  };

  return (
    <div className="ac">
      <header className="ac-top">
        <div className="ac-brand">Acme Scheduling</div>
        {/*
          A product-style subtitle, not an explanation of the demo. This page
          stands in for a customer's app; commentary about how the guide is
          wired belongs in the README, not on the screen a visitor judges.
        */}
        <p className="ac-tag">Team scheduling</p>
        <button className="ac-reset" data-testid="acme-reset" onClick={reset}>
          Reset demo
        </button>
      </header>

      <main className="ac-main">
        {notice && (
          <div role="status" data-notice className="ac-notice">
            {notice}
          </div>
        )}

        <div className="ac-head">
          <h1>Bookings</h1>
          <button
            data-testid="new-booking"
            className="ac-primary"
            onClick={() => setPanelOpen(true)}
          >
            New booking
          </button>
        </div>

        {booked ? (
          <table className="ac-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Team</th>
              </tr>
            </thead>
            <tbody>
              <tr data-testid="booking-row">
                <td>{booked.slot}</td>
                <td>{booked.team}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="ac-muted">No bookings yet.</p>
        )}

        {panelOpen && (
          <div className="ac-scrim">
            <div role="dialog" aria-label="New booking" className="ac-dialog">
              <h2>New booking</h2>

              <p className="ac-label">Pick a time</p>
              <div className="ac-slots" role="group" aria-label="Pick a time">
                {["9:00 AM", "1:30 PM", "4:00 PM"].map((s) => (
                  <button
                    key={s}
                    data-testid={`slot-${s.replace(/\D/g, "")}`}
                    aria-pressed={slot === s}
                    className={slot === s ? "on" : ""}
                    onClick={() => setSlot(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <p className="ac-label">Assign to team</p>
              <div className="ac-teams" role="group" aria-label="Assign to team">
                {(["Sales", "Support"] as const).map((t) => (
                  <button
                    key={t}
                    data-testid={`team-${t.toLowerCase()}`}
                    aria-selected={team === t}
                    data-selected={team === t}
                    className={team === t ? "on" : ""}
                    onClick={() => setTeam(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="ac-actions">
                <button data-testid="cancel-booking" onClick={() => setPanelOpen(false)}>
                  Cancel
                </button>
                <button
                  data-testid="confirm-booking"
                  className="ac-primary"
                  // Enabled once a team is chosen — including the wrong one. The
                  // product must not prevent the mistake; the guide has to
                  // notice it.
                  disabled={!team}
                  aria-disabled={!team}
                  onClick={() => {
                    const chosenSlot = slot ?? "9:00 AM";
                    setBooked({ slot: chosenSlot, team: team as string });
                    setNotice(`Booking confirmed for ${chosenSlot}.`);
                    setPanelOpen(false);
                  }}
                >
                  Confirm booking
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
