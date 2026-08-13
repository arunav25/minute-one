import type { VoiceProviderProof } from "@minute-one/core";

/**
 * The overlay, rendered into a closed-ish Shadow DOM root.
 *
 * Shadow DOM matters for an embeddable SDK: the host application's CSS cannot
 * reach in and break the guide, and the guide's CSS cannot leak out and break
 * the host. It is plain DOM rather than React so embedding costs the host no
 * framework and no version negotiation.
 */

export type OverlayView = {
  running: boolean;
  status: string;
  instruction: string;
  stepIndex: number;
  stepCount: number;
  attempt: number;
  missing: string[];
  checking: boolean;
  offeringHandoff: boolean;
  terminal: string | null;
  terminalReason: string | null;
  transcript: Array<{
    role: "user" | "assistant";
    text: string;
    /** Still being spoken — shown live and dimmed until the final arrives. */
    partial?: boolean;
  }>;
  proof: VoiceProviderProof | null;
  connectionError: string | null;
  /** Emphasised inside the instruction so the words match the ring. */
  targetLabel: string | null;
  /**
   * One-word session stage — Speaking, Listening, Waiting for you, Checking
   * the page, Correcting, Complete, Phone help available. Announced through an
   * ARIA live region as it changes.
   */
  stage: string | null;
  /**
   * Why the ring is absent, when it is — the spotlight could not resolve the
   * step's control (missing, ambiguous, disabled). Informational only; the
   * verification gate does not read it.
   */
  targetNote: string | null;
  /** Real voice is connected but the browser refused the microphone. */
  micBlocked: boolean;
  helpNumber: string;
  reportUrl: string;
};

export type OverlayHandlers = {
  onStartReal: () => void;
  onStartDemo: () => void;
  onUseSupportedGoal: () => void;
  onAcceptHandoff: () => void;
  onDeclineHandoff: () => void;
  onEnd: () => void;
};

/*
 * The mark, inlined rather than fetched.
 *
 * This renders inside someone else's page: a <img src> would need the SDK's
 * origin resolved at runtime, would cost a request the host did not ask for,
 * and would show a broken-image box if that request failed. The whole logo is
 * smaller than the URL machinery required to avoid inlining it.
 */
const LOGO = `
<svg class="logo" viewBox="0 0 64 64" width="24" height="24" aria-hidden="true">
  <defs><linearGradient id="mo-g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#9C7CFF"/><stop offset="1" stop-color="#5C34E0"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="16" fill="url(#mo-g)"/>
  <g transform="translate(32 32) scale(0.84) translate(-32 -32)" fill="none"
     stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M50.87 15.6 A25 25 0 1 1 40.55 8.51" stroke-width="4.2" opacity=".5"/>
    <path d="M21.5 33 L29.5 41 L48.9 8.3" stroke-width="5.8"/>
  </g>
</svg>`;

/*
 * Violet on light, matching the console and the report.
 *
 * The palette is deliberately split: violet is brand and interactive, green is
 * verified. Nothing that merely looks encouraging may borrow the green — it is
 * reserved for state the verification gate actually established.
 */
const STYLE = `
:host { all: initial; }
.wrap {
  position: fixed; top: 16px; right: 16px; width: 330px;
  max-height: calc(100vh - 32px); overflow-y: auto;
  background: #fff; color: #16141f; border: 1px solid #e6e3f2;
  border-radius: 16px; padding: 14px; z-index: 2147483000;
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  box-shadow: 0 18px 50px rgba(22,20,31,.16);
}
.head { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
.logo { display:block; flex:none; border-radius:7px; }
.dot { width:8px; height:8px; border-radius:50%; background:#c9c5d8; flex:none; }
.dot.on { background:#7c5cff; box-shadow:0 0 0 3px rgba(124,92,255,.18); }
.title { font-weight:700; letter-spacing:-.01em; }
.brand { color:#9a97ac; font-size:11px; }
.step { margin-left:auto; color:#7c5cff; font-family:ui-monospace,Menlo,monospace; font-size:11px; font-weight:600; }
.stage { display:inline-block; margin:0 0 8px; padding:3px 9px; border-radius:999px;
  border:1px solid #e6e3f2; background:#f4f2fc; color:#6b6880;
  font-family:ui-monospace,Menlo,monospace; font-size:10.5px; letter-spacing:.07em; text-transform:uppercase; }
.target-note { margin:0 0 10px; color:#b26b00; font-size:12.5px; }
.sr-live { position:absolute; width:1px; height:1px; overflow:hidden;
  clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; }
.proof { border:1px solid #e6e3f2; border-radius:12px; padding:10px; margin-bottom:12px; background:#fbfaff; }
.proof.real { border-color:#b6e7cb; background:#edfbf2; }
.proof.mock { border-color:#f5c2c4; background:#fef0f0; }
.badge { font-family:ui-monospace,Menlo,monospace; font-size:11px; letter-spacing:.06em; text-transform:uppercase; font-weight:600; }
.proof.real .badge { color:#0f7a43; }
.proof.mock .badge { color:#c0272d; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 10px; margin-top:10px; }
.grid dt { color:#9a97ac; font-size:10px; text-transform:uppercase; letter-spacing:.07em; margin:0; }
.grid dd { margin:0; font-family:ui-monospace,Menlo,monospace; font-size:11.5px; overflow:hidden; text-overflow:ellipsis; }
.fallback { margin:8px 0 0; color:#c0272d; font-size:11.5px; }
button { font:inherit; cursor:pointer; }
.primary { width:100%; background:#7c5cff; color:#fff; border:0; border-radius:10px; padding:12px; font-weight:650; }
.primary:hover { background:#5c34e0; }
.ghost { background:#fff; border:1px solid #d5d0ea; color:#35314a; border-radius:8px; padding:8px 12px; font-size:12.5px; }
.ghost:hover { background:#f1edff; border-color:#d9cfff; color:#5c34e0; }
.mic { margin-bottom:12px; border:1px solid #f0dcb0; background:#fff7e8; border-radius:10px; padding:10px; font-size:12.5px; }
.mic strong { color:#b26b00; }
.error { margin-top:12px; border:1px solid #f5c2c4; background:#fef0f0; border-radius:10px; padding:10px; font-size:12.5px; }
.error p { margin:0 0 8px; }
.status { color:#6b6880; margin:0 0 8px; font-size:12.5px; }
.instruction { font-size:15.5px; margin:0 0 10px; }
.instruction .target { color:#7c5cff; font-weight:700; }
.missing { border:1px solid #f5c2c4; background:#fef0f0; border-radius:10px; padding:9px 10px; margin-bottom:10px; }
.missing .label { color:#c0272d; font-family:ui-monospace,Menlo,monospace; font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; }
.missing ul { margin:6px 0 0; padding-left:16px; color:#6b6880; font-size:12.5px; }
.attempt { color:#9a97ac; font-family:ui-monospace,Menlo,monospace; font-size:11px; margin:0 0 10px; }
.actions { display:flex; gap:6px; flex-wrap:wrap; }
.card { margin-top:12px; border:1px solid #e6e3f2; border-radius:12px; padding:11px; background:#fbfaff; }
.card.completed { border-color:#b6e7cb; background:#edfbf2; }
.card.failed, .card.deadline { border-color:#f5c2c4; background:#fef0f0; }
.muted { color:#6b6880; font-size:12.5px; margin:6px 0; }
a { color:#7c5cff; font-size:12.5px; }
.transcript { margin-top:12px; border-top:1px solid #e6e3f2; padding-top:10px; max-height:170px; overflow-y:auto; font-size:12.5px; }
.transcript p { margin:0 0 7px; color:#6b6880; }
.transcript p.live { color:#9a97ac; opacity:.85; font-style:italic; }
.transcript span { display:block; font-family:ui-monospace,Menlo,monospace; font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#9a97ac; }
@media (max-width: 900px) {
  .wrap { position: static; width: auto; margin: 12px; max-height:none; }
}
`;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

export class ShadowOverlay {
  private host: HTMLElement;
  private root: ShadowRoot;
  private container: HTMLDivElement;
  private live: HTMLDivElement;
  private transcriptOpen = false;
  private view: OverlayView | null = null;

  constructor(private readonly handlers: OverlayHandlers, mount?: HTMLElement) {
    this.host = document.createElement("minute-one-overlay");
    this.host.setAttribute("data-minute-one", "overlay");
    (mount ?? document.body).appendChild(this.host);

    this.root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.container = document.createElement("div");
    this.container.className = "wrap";
    this.container.setAttribute("role", "complementary");
    this.container.setAttribute("aria-label", "Minute One voice guide");
    /*
     * The live region is a separate, persistent node: render() rebuilds the
     * panel with innerHTML, and a live region that is itself replaced on every
     * render is a new node each time, which screen readers do not announce.
     * Updating textContent on a stable node is what makes aria-live work.
     */
    this.live = document.createElement("div");
    this.live.className = "sr-live";
    this.live.setAttribute("aria-live", "polite");
    this.live.setAttribute("role", "status");
    this.root.append(style, this.container, this.live);

    this.container.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement)?.getAttribute?.(
        "data-action"
      );
      if (!action) return;
      switch (action) {
        case "start-real":
          return this.handlers.onStartReal();
        case "start-demo":
          return this.handlers.onStartDemo();
        case "goal":
          return this.handlers.onUseSupportedGoal();
        case "accept":
          return this.handlers.onAcceptHandoff();
        case "decline":
          return this.handlers.onDeclineHandoff();
        case "end":
          return this.handlers.onEnd();
        case "transcript":
          this.transcriptOpen = !this.transcriptOpen;
          if (this.view) this.render(this.view);
          return;
      }
    });
  }

  /** Exposed for tests and host inspection. */
  get shadowRoot(): ShadowRoot {
    return this.root;
  }

  render(view: OverlayView) {
    this.view = view;
    const real = view.proof?.isRealVoice ?? false;

    const proofBlock = `
      <div class="proof ${real ? "real" : "mock"}" data-testid="provider-proof">
        <span class="badge">${
          view.proof
            ? real
              ? `Voice: ${providerLabel(view.proof.provider)} ${cap(view.proof.connection)}`
              : "Voice: DEMO MODE — not real voice"
            : "Voice: not connected"
        }</span>
        ${
          view.proof
            ? `<dl class="grid">
                ${cell("Provider", view.proof.provider)}
                ${cell("Model", view.proof.model)}
                ${cell("Session", view.proof.sessionId ?? "—")}
                ${cell("State", view.proof.connection)}
                ${cell("Voice used", `${view.proof.minutes.toFixed(2)} min`)}
                ${cell("Disconnect", view.proof.disconnectReason ?? "—")}
              </dl>`
            : ""
        }
        ${
          view.proof?.fallbackReason
            ? `<p class="fallback">Fallback reason: ${esc(view.proof.fallbackReason)}</p>`
            : ""
        }
      </div>`;

    const startBlock =
      !view.running && !view.terminal
        ? `<button class="primary" data-action="start-real">Start voice guide</button>
           ${
             view.connectionError
               ? `<div class="error" role="alert">
                    <p><strong>Voice did not connect.</strong> ${esc(view.connectionError)}</p>
                    <p class="muted">Demo mode uses a scripted mock. It is not real voice and stays labelled as such.</p>
                    <button class="ghost" data-action="start-demo">Continue in demo mode</button>
                  </div>`
               : ""
           }`
        : "";

    const micBlock = view.micBlocked
      ? `<div class="mic" role="alert">
           <strong>Microphone blocked.</strong>
           <p class="muted">The voice session is connected, but the browser refused capture. Allow the microphone for this site, then press End and start again.</p>
         </div>`
      : "";

    const runningBlock = view.running
      ? `${view.stage ? `<span class="stage" data-testid="stage">${esc(view.stage)}</span>` : ""}
         <p class="status">${esc(view.checking ? "Checking your page…" : view.status)}</p>
         ${view.targetNote ? `<p class="target-note" data-testid="target-note">${esc(view.targetNote)}</p>` : ""}
         ${view.instruction ? `<p class="instruction" data-testid="instruction">${emphasise(view.instruction, view.targetLabel)}</p>` : ""}
         ${
           view.missing.length
             ? `<div class="missing" data-testid="missing-evidence">
                  <span class="label">Check failed — missing</span>
                  <ul>${view.missing.slice(0, 3).map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
                </div>`
             : ""
         }
         ${view.attempt > 0 ? `<p class="attempt">Attempt ${view.attempt + 1}</p>` : ""}
         <div class="actions">
           <button class="ghost" data-action="goal">Use supported goal</button>
           <button class="ghost" data-action="transcript">Transcript</button>
           <button class="ghost" data-action="end">End</button>
         </div>`
      : "";

    const handoffBlock = view.offeringHandoff
      ? /*
         * Deliberately does not offer to call anybody.
         *
         * This used to read "Yes, call me" and promise a new phone session.
         * Nothing dials: accepting records the handoff and ends the session as
         * partial. Until a telephony provider is actually wired up, the honest
         * offer is the number and the session reference to quote.
         */
        `<div class="card" data-testid="handoff-card">
           <strong>Prefer to talk to a person?</strong>
           <p class="muted">Support is on ${esc(view.helpNumber)}. Quote your session
           reference and they can pick up from the step you are on — the report records
           where it stopped. Minute One does not place the call for you.</p>
           <div class="actions">
             <button class="primary" data-action="accept">Show phone support</button>
             <button class="ghost" data-action="decline">Keep trying</button>
           </div>
         </div>`
      : "";

    const terminalBlock = view.terminal
      ? `<div class="card ${view.terminal}" data-testid="terminal">
           <strong>Session ${esc(view.terminal)}</strong>
           <p class="muted">${esc(view.terminalReason ?? "")}</p>
           <a href="${esc(view.reportUrl)}">Open the session report →</a>
         </div>`
      : "";

    const transcriptBlock = this.transcriptOpen
      ? `<div class="transcript">${
          view.transcript.length
            ? view.transcript
                .map(
                  (l) =>
                    `<p class="${l.partial ? "live" : ""}"><span>${l.role === "user" ? "You" : "Guide"}</span>${esc(l.text)}</p>`
                )
                .join("")
            : `<p class="muted">Nothing spoken yet.</p>`
        }</div>`
      : "";

    /*
     * During a running journey the panel presents as "Guide me" — the thing it
     * is doing — with Minute One reduced to a brand label. Only the label
     * changes: packages, globals, storage keys and events all keep their names.
     */
    this.container.innerHTML = `
      <div class="head">
        ${LOGO}
        <span class="dot ${view.running ? "on" : ""}"></span>
        <span class="title">${view.running ? "Guide me" : "Minute One"}</span>
        ${view.running ? `<span class="brand">Minute One</span>` : ""}
        <span class="step">${
          view.running && view.stepCount
            ? `Step ${Math.min(view.stepIndex + 1, view.stepCount)} of ${view.stepCount}`
            : ""
        }</span>
      </div>
      ${proofBlock}${micBlock}${startBlock}${runningBlock}${handoffBlock}${terminalBlock}${transcriptBlock}`;

    // Announce stage changes without re-announcing every repaint.
    const announcement = view.stage ?? view.terminal ?? "";
    if (announcement && this.live.textContent !== announcement) {
      this.live.textContent = announcement;
    }
  }

  destroy() {
    this.host.remove();
  }
}

/** Bolds the target's label so the spoken words match the highlighted control. */
function emphasise(text: string, label: string | null): string {
  const safe = esc(text);
  if (!label) return safe;
  const needle = esc(label);
  const at = safe.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return safe;
  return (
    safe.slice(0, at) +
    `<strong class="target">${safe.slice(at, at + needle.length)}</strong>` +
    safe.slice(at + needle.length)
  );
}

const cell = (label: string, value: string) =>
  `<div><dt>${esc(label)}</dt><dd title="${esc(value)}">${esc(value)}</dd></div>`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const providerLabel = (provider: string) =>
  provider === "deepgram"
    ? "Deepgram"
    : provider === "pyai"
      ? "PyAI"
      : cap(provider);
