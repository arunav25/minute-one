"use client";

import { useEffect, useState } from "react";
import type { ReportData, SessionEvent } from "@minute-one/core";
import {
  api,
  setupState,
  trainAgent,
  useSources,
  type DataSource,
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
  /** Raw events, so Sessions can show what happened rather than only totals. */
  events: SessionEvent[];
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

const SOURCE_BADGE: Record<DataSource["kind"], string> = {
  text: "Text",
  qa: "Q&A",
  file: "File",
  article: "Website",
};

function formatBytes(n: number) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function KnowledgePanel({ product, busy, run }: PanelProps) {
  const { data, reload } = useSources(product.id);
  const [drawer, setDrawer] = useState<null | "text" | "qa" | "file">(null);
  const [search, setSearch] = useState("");
  const [training, setTraining] = useState(false);
  const [trainNote, setTrainNote] = useState<string | null>(null);

  const sources = (data?.sources ?? []).filter(
    (s) => !search || s.title.toLowerCase().includes(search.toLowerCase())
  );
  const untrained = (data?.sources ?? []).filter((s) => !s.trained).length;

  const retrain = () =>
    void run(async () => {
      setTraining(true);
      setTrainNote(null);
      try {
        const r = await trainAgent(product.id);
        setTrainNote(
          `Trained ${r.trainedNotes} source${r.trainedNotes === 1 ? "" : "s"} into ${r.totalChunks} chunks.`
        );
        await reload();
      } finally {
        setTraining(false);
      }
    });

  return (
    <>
      <div className="cn-src-head">
        <PanelHead
          title="Data sources"
          lede="Everything the guide can retrieve at answer time. Train after adding sources so the voice agent can search them."
        />
        <div className="cn-src-train">
          <span className="cn-muted">
            Last trained {timeAgo(data?.lastTrainedAt ?? null)}
          </span>
          <button
            className="cn-primary"
            data-testid="retrain-agent"
            disabled={busy || training || !data?.canTrain}
            title={
              data?.canTrain === false
                ? "Set DATABASE_URL and OPENAI_API_KEY to enable training"
                : undefined
            }
            onClick={retrain}
          >
            {training ? "Training…" : "Retrain agent"}
          </button>
        </div>
      </div>

      {trainNote && <div className="cn-note">{trainNote}</div>}
      {data?.canTrain === false && (
        <div className="cn-note">
          Semantic training is off: set <code>DATABASE_URL</code> and{" "}
          <code>OPENAI_API_KEY</code> on the server. Sources still reach the
          guide as prompt context.
        </div>
      )}

      <div className="cn-src-cards">
        <button className="cn-src-card" onClick={() => setDrawer("file")}>
          <span className="cn-src-card-icon">📄</span> Add files
        </button>
        <button className="cn-src-card" onClick={() => setDrawer("text")}>
          <span className="cn-src-card-icon">✏️</span> Add text snippet
        </button>
        <button className="cn-src-card" onClick={() => setDrawer("qa")}>
          <span className="cn-src-card-icon">💬</span> Add Q&amp;A
        </button>
        <div className="cn-src-card cn-src-card-static" title="Import a help-center archive with scripts/ingest-knowledge.mjs">
          <span className="cn-src-card-icon">🌐</span> Website import
          <span className="cn-src-card-hint">via CLI</span>
        </div>
      </div>

      <div className="cn-src-toolbar">
        <input
          className="cn-src-search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="cn-muted">
          {untrained > 0 && `${untrained} untrained · `}
          Total size: <strong>{formatBytes(data?.totalBytes ?? 0)}</strong>
        </span>
      </div>

      {sources.length === 0 ? (
        <div className="cn-empty">
          <h3>No sources yet</h3>
          <p>
            Add a text snippet, a Q&amp;A pair, or a file — or import a
            help-center archive from the CLI. The guide answers only from what
            is here.
          </p>
        </div>
      ) : (
        <ul className="cn-src-list" data-testid="source-list">
          {sources.map((s) => (
            <li key={s.id} className="cn-src-row">
              <div className="cn-src-row-main">
                <strong>{s.title}</strong>
                <span className="cn-muted">
                  {formatWhen(s.updatedAt)} · {formatBytes(s.bytes)}
                  {s.chunks > 0 && ` · ${s.chunks} chunk${s.chunks === 1 ? "" : "s"}`}
                </span>
              </div>
              <span
                className={`cn-src-status ${s.trained ? "trained" : "untrained"}`}
                title={
                  s.trained
                    ? `In the semantic index since ${formatWhen(s.trainedAt)}`
                    : "Not in the semantic index yet — press Retrain agent"
                }
              >
                {s.trained ? "Trained" : "Untrained"}
              </span>
              <span className={`cn-src-badge kind-${s.kind}`}>
                {SOURCE_BADGE[s.kind]}
              </span>
              <button
                className="cn-ghost"
                onClick={() =>
                  void run(async () => {
                    await api(
                      s.kind === "article"
                        ? {
                            action: "remove-article",
                            productId: product.id,
                            articleId: s.id,
                          }
                        : {
                            action: "remove-knowledge",
                            productId: product.id,
                            entryId: s.id,
                          }
                    );
                    await reload();
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {drawer && (
        <SourceDrawer
          kind={drawer}
          busy={busy}
          onClose={() => setDrawer(null)}
          onAdd={async (title, body, kind) => {
            const ok = await run(async () => {
              await api({
                action: "add-knowledge",
                productId: product.id,
                title,
                body,
                kind,
              });
              await reload();
            });
            if (ok) setDrawer(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Right-hand drawer for adding a source, one form per kind. Q&A pairs are
 * stored as title=question, body=answer; files are read in the browser and
 * stored as their text.
 */
function SourceDrawer({
  kind,
  busy,
  onClose,
  onAdd,
}: {
  kind: "text" | "qa" | "file";
  busy: boolean;
  onClose: () => void;
  onAdd: (title: string, body: string, kind: "text" | "qa" | "file") => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const heading =
    kind === "text" ? "Add text snippet" : kind === "qa" ? "Add Q&A" : "Add file";

  return (
    <div className="cn-drawer-overlay" onClick={onClose}>
      <aside className="cn-drawer" onClick={(e) => e.stopPropagation()}>
        <header className="cn-drawer-head">
          <h3>{heading}</h3>
          <button className="cn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <form
          className="cn-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !body.trim()) return;
            void onAdd(title, body, kind);
          }}
        >
          {kind === "file" ? (
            <>
              <label htmlFor="src-file">Markdown or text file (max 1 MB)</label>
              <input
                id="src-file"
                type="file"
                accept=".md,.markdown,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 1024 * 1024) {
                    setFileName(`${file.name} is too large`);
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setTitle(file.name.replace(/\.(md|markdown|txt)$/i, ""));
                    setBody(String(reader.result ?? ""));
                    setFileName(file.name);
                  };
                  reader.readAsText(file);
                }}
              />
              {fileName && <p className="cn-muted">{fileName}</p>}
            </>
          ) : (
            <>
              <label htmlFor="kb-title">
                {kind === "qa" ? "Question" : "Title"}
              </label>
              <input
                id="kb-title"
                data-testid="kb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  kind === "qa"
                    ? "How do I buy a phone number?"
                    : "Ex: Refund requests"
                }
              />
              <label htmlFor="kb-body">
                {kind === "qa" ? "Answer" : "Enter your text"}
              </label>
              <textarea
                id="kb-body"
                data-testid="kb-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  kind === "qa"
                    ? "Open the Phone Numbers section, choose Add Number, pick a country, then confirm."
                    : "What the guide should know, in plain language."
                }
              />
            </>
          )}
          <button
            className="cn-primary"
            data-testid="add-knowledge"
            disabled={busy || !title.trim() || !body.trim()}
          >
            {heading}
          </button>
        </form>
      </aside>
    </div>
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

/**
 * What one event means, in the console's voice.
 *
 * The overlay deliberately hides the engine's vocabulary from the guided user;
 * here it is the point. Whoever authored the journey needs to see the failed
 * check and the rule that failed, because that is the thing they can fix.
 */
function describeEvent(e: SessionEvent): { label: string; detail: string; tone: string } {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case "session_started":
      return { label: "Session started", detail: "", tone: "" };
    case "voice_provider":
      return {
        label: "Voice connected",
        detail: `${d.provider ?? "—"} · ${d.model ?? "—"}${
          d.isRealVoice === false ? " · demo mode, not real voice" : ""
        }`,
        tone: d.isRealVoice === false ? "warn" : "ok",
      };
    case "goal_selected":
      return { label: "Goal chosen", detail: String(d.goal ?? ""), tone: "" };
    case "step_instructed":
      return {
        label: `Instructed${e.stepId ? ` · ${e.stepId}` : ""}`,
        detail: String(d.instruction ?? ""),
        tone: "",
      };
    case "verification_checked":
      return d.passed
        ? { label: "Check passed", detail: String(e.stepId ?? ""), tone: "ok" }
        : {
            label: "Check failed",
            detail: String(d.missing ?? "no evidence recorded"),
            tone: "bad",
          };
    case "recovery_spoken":
      return {
        label: `Recovery${d.mode ? ` · ${d.mode}` : ""}`,
        detail: String(d.text ?? ""),
        tone: "warn",
      };
    case "stuck_signal":
      return { label: "User said they were stuck", detail: String(e.reason ?? ""), tone: "warn" };
    case "handoff_offered":
      return { label: "Phone help offered", detail: String(e.reason ?? ""), tone: "warn" };
    case "handoff_accepted":
      return { label: "Phone help accepted", detail: "", tone: "warn" };
    case "handoff_declined":
      return { label: "Phone help declined", detail: "", tone: "" };
    case "session_ended":
      return {
        label: `Session ${d.terminal ?? "ended"}`,
        detail: d.voiceMinutes ? `${Number(d.voiceMinutes).toFixed(2)} voice minutes` : "",
        tone: d.terminal === "completed" ? "ok" : "warn",
      };
    default:
      return { label: e.type, detail: String(e.reason ?? ""), tone: "" };
  }
}

export function SessionsPanel({ report, eventCount, identities, events }: PanelProps) {
  const [open, setOpen] = useState<string | null>(null);

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
        lede="Every run of the guide from this product's embed. Open one to see what the guide said, what it checked, and where it failed — the detail the guided user never sees."
      />
      <ul className="cn-sess" data-testid="session-list">
        {report?.sessions.map((s) => {
          const isOpen = open === s.sessionId;
          const mine = events
            .filter((e) => e.sessionId === s.sessionId)
            .sort((a, b) => a.sequence - b.sequence);
          return (
            <li key={s.sessionId} className="cn-sess-item">
              <button
                className="cn-sess-row"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : s.sessionId)}
              >
                <span className={`cn-src-status ${s.terminal === "completed" ? "trained" : "untrained"}`}>
                  {s.terminal ?? "in progress"}
                </span>
                <span className="cn-sess-who">{describeUser(identities[s.sessionId])}</span>
                <span className="cn-muted">
                  {s.provider ?? "—"}
                  {s.isRealVoice === false && " (demo)"}
                  {s.durationMs ? ` · ${Math.round(s.durationMs / 1000)}s` : ""}
                </span>
                <span className="cn-sess-caret">{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && (
                <div className="cn-sess-detail">
                  <dl className="cn-sess-proof">
                    <div>
                      <dt>Provider session</dt>
                      <dd>{s.providerSessionId ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{s.model ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Real voice</dt>
                      <dd>{s.isRealVoice === null ? "—" : s.isRealVoice ? "yes" : "no"}</dd>
                    </div>
                    <div>
                      <dt>Minute One session</dt>
                      <dd>{s.sessionId}</dd>
                    </div>
                  </dl>

                  <ol className="cn-timeline">
                    {mine.map((e) => {
                      const { label, detail, tone } = describeEvent(e);
                      return (
                        <li key={e.sequence} className={tone}>
                          <span className="cn-timeline-time">
                            {new Date(e.at).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                          <span className="cn-timeline-label">{label}</span>
                          {detail && <span className="cn-timeline-detail">{detail}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ul>
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
