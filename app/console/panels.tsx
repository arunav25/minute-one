"use client";

import { useEffect, useState } from "react";
import type { ReportData } from "@minute-one/core";
import {
  api,
  setupState,
  type JourneyStep,
  type Product,
  type SessionIdentity,
} from "./console-data";

/**
 * The console's panels.
 *
 * Each one is honest about what Minute One can actually prove. Where a number
 * cannot be derived yet the panel says so rather than showing a zero that reads
 * like a measurement.
 */

type PanelProps = {
  product: Product;
  report: ReportData | null;
  eventCount: number;
  identities: Record<string, SessionIdentity>;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
};

const origin = () =>
  typeof window === "undefined" ? "https://localhost:3200" : window.location.origin;

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

export function OverviewPanel({ product, report, eventCount }: PanelProps) {
  const steps = setupState(product, eventCount > 0);
  const remaining = steps.filter((s) => !s.done);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <>
      <PanelHead
        title="Overview"
        lede="What this product's guide has actually done. Scoped to this product — seeded demo sessions are excluded."
      />

      {eventCount === 0 ? (
        <div className="cn-empty">
          <h3>No sessions yet</h3>
          <p>
            Nothing has been reported by this product&apos;s embed. Finish the
            setup checklist, then open the page you installed it on.
          </p>
          {remaining.length > 0 && (
            <p className="cn-muted">
              Still to do: {remaining.map((s) => s.title.toLowerCase()).join(", ")}.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="cn-tiles">
            <Tile label="Sessions" value={String(report?.sessions.length ?? 0)} note="reported by this embed" />
            <Tile label="Completed" value={pct(report?.completionRate ?? 0)} note="reached the goal" />
            <Tile
              label="Real voice"
              value={`${report?.realVoiceSessions ?? 0} of ${report?.sessions.length ?? 0}`}
              note="provider audio, not the mock"
            />
            <Tile
              label="Voice used"
              value={`${(report?.totalVoiceMinutes ?? 0).toFixed(2)} min`}
              note="across all sessions"
            />
            <Tile label="Recovered" value={pct(report?.recoveryRate ?? 0)} note="after a failed check" />
            <Tile
              label="Median time"
              value={
                report?.medianCompletionMs
                  ? `${Math.round(report.medianCompletionMs / 1000)}s`
                  : "—"
              }
              note="signup to goal"
            />
          </div>

          {report?.topFailedStep && (
            <div className="cn-note">
              Most failed step: <strong>{report.topFailedStep}</strong>. Its success
              condition may not match what the page actually shows.
            </div>
          )}

          <section>
            <h3>Steps</h3>
            {report && report.steps.length > 0 ? (
              <div className="cn-scroll">
                <table className="cn-table">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th>Instructed</th>
                      <th>Failed checks</th>
                      <th>Recoveries</th>
                      <th>Top missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.steps.map((s) => (
                      <tr key={s.stepId}>
                        <td>{s.stepId}</td>
                        <td>{s.instructed}</td>
                        <td>{s.failedChecks}</td>
                        <td>{s.recoveries}</td>
                        <td className="cn-muted">{s.topMissing ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="cn-muted">No step activity recorded.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="cn-tile">
      <span className="cn-tile-label">{label}</span>
      <strong className="cn-tile-value">{value}</strong>
      <span className="cn-tile-note">{note}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Setup checklist                                                            */
/* -------------------------------------------------------------------------- */

export function SetupPanel({
  product,
  eventCount,
  onGo,
}: PanelProps & { onGo: (section: string) => void }) {
  const steps = setupState(product, eventCount > 0);
  const target: Record<string, string> = {
    product: "settings",
    knowledge: "knowledge",
    journey: "journey",
    install: "install",
  };

  return (
    <>
      <PanelHead
        title="Setup"
        lede="Four things to have in place. Each one is ticked from the product itself, not from a box you check by hand."
      />
      <ol className="cn-checklist">
        {steps.map((s, i) => (
          <li key={s.id} className={s.done ? "done" : ""}>
            <span className="cn-check-num">{s.done ? "✓" : i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <p className="cn-muted">{s.detail}</p>
            </div>
            <button className="cn-ghost" onClick={() => onGo(target[s.id])}>
              {s.done ? "Review" : "Set up"}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Knowledge                                                                  */
/* -------------------------------------------------------------------------- */

export function KnowledgePanel({ product, busy, run }: PanelProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <>
      <PanelHead
        title="Knowledge"
        lede="Everything the guide is allowed to know. It answers from here and says it does not know rather than inventing an answer."
      />

      {product.knowledge.length === 0 ? (
        <div className="cn-empty">
          <h3>Nothing here yet</h3>
          <p>The guide will tell users it has no information about this product.</p>
        </div>
      ) : (
        <ul className="cn-kb">
          {product.knowledge.map((k) => (
            <li key={k.id}>
              <div>
                <strong>{k.title}</strong>
                <p>{k.body}</p>
              </div>
              <button
                className="cn-ghost"
                onClick={() =>
                  void run(() =>
                    api({
                      action: "remove-knowledge",
                      productId: product.id,
                      entryId: k.id,
                    })
                  )
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="cn-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !body.trim()) return;
          void run(async () => {
            await api({
              action: "add-knowledge",
              productId: product.id,
              title,
              body,
            });
            setTitle("");
            setBody("");
          });
        }}
      >
        <h3>Add a note</h3>
        <label htmlFor="kb-title">Question or topic</label>
        <input
          id="kb-title"
          data-testid="kb-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="How do I invite my team?"
        />
        <label htmlFor="kb-body">What the guide should say</label>
        <textarea
          id="kb-body"
          data-testid="kb-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Choose Invite your team on the Get Started page, enter an email, pick a role, then choose Invite."
        />
        <button className="cn-primary" data-testid="add-knowledge" disabled={busy}>
          Add to knowledge
        </button>
      </form>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Journey                                                                    */
/* -------------------------------------------------------------------------- */

const blankStep = (n: number): JourneyStep => ({
  id: `step-${n}`,
  objective: "",
  instruction: "",
  targetName: "",
  successText: "",
  successRoute: "",
});

export function JourneyPanel({ product, busy, run }: PanelProps) {
  const [goal, setGoal] = useState(product.goal);
  const [phrases, setPhrases] = useState(product.goalPhrases.join(", "));
  const [steps, setSteps] = useState<JourneyStep[]>(product.steps);
  const [saved, setSaved] = useState(false);

  // Switching products must not leave the previous product's draft on screen.
  useEffect(() => {
    setGoal(product.goal);
    setPhrases(product.goalPhrases.join(", "));
    setSteps(product.steps);
    setSaved(false);
  }, [product.id, product.goal, product.goalPhrases, product.steps]);

  const patch = (i: number, field: keyof JourneyStep, value: string) =>
    setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, [field]: value } : s)));

  const move = (i: number, by: number) =>
    setSteps((cur) => {
      const next = [...cur];
      const j = i + by;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const incomplete = steps.filter(
    (s) => !s.instruction.trim() || !(s.successText?.trim() || s.successRoute?.trim())
  );

  return (
    <>
      <PanelHead
        title="Journey"
        lede="The steps the guide walks a user through. A step only advances when its success condition is actually observed on the page — the model cannot decide it passed."
      />

      <div className="cn-form">
        <label htmlFor="goal">Goal</label>
        <input
          id="goal"
          data-testid="journey-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Invite your team"
        />
        <label htmlFor="phrases">
          Phrases that mean this goal <span className="cn-muted">(comma separated)</span>
        </label>
        <input
          id="phrases"
          value={phrases}
          onChange={(e) => setPhrases(e.target.value)}
          placeholder="invite, add teammates, get my team in"
        />
      </div>

      <section>
        <h3>Steps</h3>
        {steps.length === 0 && (
          <p className="cn-muted">
            No steps. The guide will run in answer-only mode: it can talk, but it
            cannot claim anything was completed.
          </p>
        )}

        <ol className="cn-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <div className="cn-step-head">
                <strong>Step {i + 1}</strong>
                <div className="cn-step-tools">
                  <button className="cn-ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button
                    className="cn-ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === steps.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    className="cn-ghost"
                    onClick={() => setSteps((cur) => cur.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <label>Step id</label>
              <input value={s.id} onChange={(e) => patch(i, "id", e.target.value)} />

              <label>Objective</label>
              <input
                value={s.objective}
                onChange={(e) => patch(i, "objective", e.target.value)}
                placeholder="Open the invite dialog"
              />

              <label>Spoken instruction</label>
              <textarea
                value={s.instruction}
                onChange={(e) => patch(i, "instruction", e.target.value)}
                placeholder="Choose Invite your team to open the invite dialog."
              />

              <label>
                Control to point at{" "}
                <span className="cn-muted">(its visible name, not a CSS selector)</span>
              </label>
              <input
                value={s.targetName ?? ""}
                onChange={(e) => patch(i, "targetName", e.target.value)}
                placeholder="Invite your team"
              />

              <div className="cn-proof">
                <p className="cn-muted">
                  Proof that the step worked. At least one is required, and it has
                  to be something only true <em>after</em> the action — text that
                  is already on the page before it will pass immediately.
                </p>
                <label>Text that must become visible</label>
                <input
                  value={s.successText ?? ""}
                  onChange={(e) => patch(i, "successText", e.target.value)}
                  placeholder="will be shared with the invited team members"
                />
                <label>
                  or a route that must match <span className="cn-muted">(e.g. /dialer*)</span>
                </label>
                <input
                  value={s.successRoute ?? ""}
                  onChange={(e) => patch(i, "successRoute", e.target.value)}
                  placeholder="/dialer*"
                />
              </div>
            </li>
          ))}
        </ol>

        <button
          className="cn-ghost"
          onClick={() => setSteps((cur) => [...cur, blankStep(cur.length + 1)])}
        >
          + Add step
        </button>
      </section>

      {incomplete.length > 0 && (
        <div className="cn-warn">
          {incomplete.length} step{incomplete.length === 1 ? "" : "s"} still need an
          instruction and a success condition. Saving now would leave the guide
          unable to verify {incomplete.length === 1 ? "it" : "them"}.
        </div>
      )}

      <button
        className="cn-primary"
        data-testid="save-journey"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await api({
              action: "update",
              productId: product.id,
              goal,
              goalPhrases: phrases
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean),
              steps: steps.map((s) => ({
                ...s,
                targetName: s.targetName?.trim() || undefined,
                successText: s.successText?.trim() || undefined,
                successRoute: s.successRoute?.trim() || undefined,
              })),
            });
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2000);
          })
        }
      >
        {saved ? "Saved" : "Save journey"}
      </button>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Install                                                                    */
/* -------------------------------------------------------------------------- */

export function InstallPanel({ product, eventCount }: PanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const snippet = `<script src="${origin()}/minute-one.js"\n        data-product-key="${product.key}"></script>`;
  const identified = `<script>
  window.minuteOneSettings = {
    productKey: "${product.key}",
    user: {
      id: user.id,
      email: user.email,
      name: user.fullName,
      createdAt: user.createdAt,   // ISO string or epoch seconds
      locale: user.locale,
    },
    company: { id: user.companyId, name: user.companyName, meta: { plan: user.plan } },
  };
</script>
<script src="${origin()}/minute-one.js"></script>`;
  const teardown = `window.MinuteOne?.destroy();`;

  const copy = (text: string, which: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <>
      <PanelHead
        title="Install snippet"
        lede="One script tag on the page you want guided. Nothing else changes in the host application."
      />

      <section>
        <h3>Product key</h3>
        <p className="cn-muted">
          Public by design — it selects this product&apos;s context. It cannot
          authorise voice: that is minted server-side, and your Deepgram secret never
          reaches the page. The key only works from the origins listed in
          Settings.
        </p>
        <code className="cn-key" data-testid="product-key">
          {product.key}
        </code>
      </section>

      <section>
        <h3>Embed snippet</h3>
        <pre className="cn-snippet" data-testid="embed-snippet">
          {snippet}
        </pre>
        <div className="cn-row">
          <button className="cn-ghost" onClick={() => copy(snippet, "snippet")}>
            {copied === "snippet" ? "Copied" : "Copy"}
          </button>
          <a
            className="cn-ghost"
            href={`/embed-test?key=${encodeURIComponent(product.key)}`}
          >
            Try it on a test page →
          </a>
        </div>
      </section>

      <section>
        <h3>Identify the signed-in user</h3>
        <p className="cn-muted">
          Optional. Set this before the tag and sessions are attributed to a real
          user instead of showing as unidentified. This is reported with sessions
          only — it is never added to the voice context, so the guide does not
          speak your users&apos; names or email addresses back to them.
        </p>
        <pre className="cn-snippet">{identified}</pre>
        <button className="cn-ghost" onClick={() => copy(identified, "identified")}>
          {copied === "identified" ? "Copied" : "Copy"}
        </button>
      </section>

      <section>
        <h3>Shut down on logout</h3>
        <p className="cn-muted">
          Removes the overlay, stops the microphone, and closes the voice socket.
        </p>
        <pre className="cn-snippet">{teardown}</pre>
        <button className="cn-ghost" onClick={() => copy(teardown, "teardown")}>
          {copied === "teardown" ? "Copied" : "Copy"}
        </button>
      </section>

      <div className={eventCount > 0 ? "cn-ok" : "cn-note"}>
        {eventCount > 0
          ? "Install confirmed — this product has reported sessions."
          : "Waiting for the first session from this key. This page updates on its own."}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export function SettingsPanel({ product, busy, run }: PanelProps) {
  const [name, setName] = useState(product.name);
  const [origins, setOrigins] = useState(product.allowedOrigins.join("\n"));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(product.name);
    setOrigins(product.allowedOrigins.join("\n"));
  }, [product.id, product.name, product.allowedOrigins]);

  return (
    <>
      <PanelHead title="Settings" lede="Who may use this key, and what this product is called." />

      <div className="cn-form">
        <label htmlFor="pname">Product name</label>
        <input id="pname" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="origins">Allowed origins</label>
        <p className="cn-muted">
          One per line, scheme included. The key is refused from anywhere else,
          and no voice token is minted for an origin that is not listed. Leaving
          this empty allows local pages only, so an unfinished product cannot be
          picked up from the internet.
        </p>
        <textarea
          id="origins"
          data-testid="allowed-origins"
          value={origins}
          onChange={(e) => setOrigins(e.target.value)}
          placeholder={"https://app.justcall.local\nhttps://app.easycalendar.com"}
          rows={4}
        />

        <button
          className="cn-primary"
          data-testid="save-settings"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api({
                action: "update",
                productId: product.id,
                name,
                allowedOrigins: origins
                  .split("\n")
                  .map((o) => o.trim())
                  .filter(Boolean),
              });
              setSaved(true);
              window.setTimeout(() => setSaved(false), 2000);
            })
          }
        >
          {saved ? "Saved" : "Save settings"}
        </button>
      </div>

      <section>
        <h3>Voice</h3>
        <p className="cn-muted">
          Configured on the server, not per product: <code>DEEPGRAM_API_KEY</code> and{" "}
          <code>DEEPGRAM_ALLOWED_ORIGINS</code> in <code>.env.local</code>. The
          browser receives a temporary token, while the API key stays on the server.
        </p>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export function SessionsPanel({ report, eventCount, identities }: PanelProps) {
  if (eventCount === 0) {
    return (
      <>
        <PanelHead title="Sessions" lede="Every run of the guide from this product's embed." />
        <div className="cn-empty">
          <h3>No sessions yet</h3>
          <p>Install the snippet and open the page you put it on.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PanelHead
        title="Sessions"
        lede="Every run of the guide from this product's embed, with the voice provider it actually used."
      />
      <div className="cn-scroll">
        <table className="cn-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>User</th>
              <th>Outcome</th>
              <th>Reason</th>
              <th>Voice</th>
              <th>Real</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {report?.sessions.map((s) => (
              <tr key={s.sessionId}>
                <td>
                  <code>{s.sessionId}</code>
                </td>
                <td>{describeUser(identities[s.sessionId])}</td>
                <td>{s.terminal ?? "in progress"}</td>
                <td className="cn-muted">{s.reason ?? "—"}</td>
                <td>{s.provider ?? "—"}</td>
                <td>{s.isRealVoice === null ? "—" : s.isRealVoice ? "yes" : "no"}</td>
                <td>{s.durationMs ? `${Math.round(s.durationMs / 1000)}s` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <a className="cn-ghost" href="/report">
        Open the full report →
      </a>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function PanelHead({ title, lede }: { title: string; lede: string }) {
  return (
    <header className="cn-panel-head">
      <h1>{title}</h1>
      <p className="cn-muted">{lede}</p>
    </header>
  );
}

/**
 * How a session is labelled in the table.
 *
 * A host that passes no identity is normal — the snippet works without one — so
 * this says "not identified" rather than inventing an anonymous id.
 */
function describeUser(identity: SessionIdentity | undefined) {
  if (!identity) return <span className="cn-muted">not identified</span>;
  const who = identity.name ?? identity.email ?? identity.userId;
  if (!who) return <span className="cn-muted">not identified</span>;
  return (
    <span>
      {who}
      {identity.companyName ? <span className="cn-muted"> · {identity.companyName}</span> : null}
    </span>
  );
}
