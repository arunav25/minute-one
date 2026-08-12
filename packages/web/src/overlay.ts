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
  transcript: Array<{ role: "user" | "assistant"; text: string }>;
  proof: VoiceProviderProof | null;
  connectionError: string | null;
  /** Emphasised inside the instruction so the words match the ring. */
  targetLabel: string | null;
  /** PyAI is connected but the browser refused the microphone. */
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

const STYLE = `
:host { all: initial; }
.wrap {
  position: fixed; top: 16px; right: 16px; width: 330px;
  max-height: calc(100vh - 32px); overflow-y: auto;
  background: #141819; color: #e9eeec; border: 1px solid #353f43;
  border-radius: 14px; padding: 14px; z-index: 2147483000;
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  box-shadow: 0 18px 50px rgba(0,0,0,.45);
}
.head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.dot { width:8px; height:8px; border-radius:50%; background:#6b7a76; }
.dot.on { background:#c6ff4a; box-shadow:0 0 10px rgba(198,255,74,.8); }
.title { font-weight:700; }
.step { margin-left:auto; color:#6b7a76; font-family:ui-monospace,Menlo,monospace; font-size:11px; }
.proof { border:1px solid #353f43; border-radius:10px; padding:10px; margin-bottom:12px; background:#1b2022; }
.proof.real { border-color: rgba(126,224,129,.55); }
.proof.mock { border-color: rgba(255,107,94,.6); }
.badge { font-family:ui-monospace,Menlo,monospace; font-size:11px; letter-spacing:.06em; text-transform:uppercase; }
.proof.real .badge { color:#7ee081; }
.proof.mock .badge { color:#ff6b5e; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 10px; margin-top:10px; }
.grid dt { color:#6b7a76; font-size:10px; text-transform:uppercase; letter-spacing:.07em; margin:0; }
.grid dd { margin:0; font-family:ui-monospace,Menlo,monospace; font-size:11.5px; overflow:hidden; text-overflow:ellipsis; }
.fallback { margin:8px 0 0; color:#ff6b5e; font-size:11.5px; }
button { font:inherit; cursor:pointer; }
.primary { width:100%; background:#c6ff4a; color:#0b0d0f; border:0; border-radius:9px; padding:12px; font-weight:650; }
.ghost { background:transparent; border:1px solid #353f43; color:#97a5a1; border-radius:8px; padding:8px 12px; font-size:12.5px; }
.mic { margin-bottom:12px; border:1px solid rgba(255,200,121,.55); background:rgba(255,200,121,.09); border-radius:9px; padding:10px; font-size:12.5px; }
.mic strong { color:#ffc879; }
.error { margin-top:12px; border:1px solid rgba(255,107,94,.5); background:rgba(255,107,94,.08); border-radius:9px; padding:10px; font-size:12.5px; }
.error p { margin:0 0 8px; }
.status { color:#97a5a1; margin:0 0 8px; font-size:12.5px; }
.instruction { font-size:15.5px; margin:0 0 10px; }
.instruction .target { color:#7c5cff; font-weight:700; }
.missing { border:1px solid rgba(255,107,94,.5); background:rgba(255,107,94,.08); border-radius:9px; padding:9px 10px; margin-bottom:10px; }
.missing .label { color:#ff6b5e; font-family:ui-monospace,Menlo,monospace; font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; }
.missing ul { margin:6px 0 0; padding-left:16px; color:#97a5a1; font-size:12.5px; }
.attempt { color:#6b7a76; font-family:ui-monospace,Menlo,monospace; font-size:11px; margin:0 0 10px; }
.actions { display:flex; gap:6px; flex-wrap:wrap; }
.card { margin-top:12px; border:1px solid #353f43; border-radius:10px; padding:11px; background:#1b2022; }
.card.completed { border-color:rgba(126,224,129,.5); }
.card.failed, .card.deadline { border-color:rgba(255,107,94,.5); }
.muted { color:#6b7a76; font-size:12.5px; margin:6px 0; }
a { color:#c6ff4a; font-size:12.5px; }
.transcript { margin-top:12px; border-top:1px solid #262d30; padding-top:10px; max-height:170px; overflow-y:auto; font-size:12.5px; }
.transcript p { margin:0 0 7px; color:#97a5a1; }
.transcript span { display:block; font-family:ui-monospace,Menlo,monospace; font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#6b7a76; }
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
    this.root.append(style, this.container);

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
              ? `Voice: PyAI ${cap(view.proof.connection)}`
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
                    <p><strong>PyAI did not connect.</strong> ${esc(view.connectionError)}</p>
                    <p class="muted">Demo mode uses a scripted mock. It is not real voice and stays labelled as such.</p>
                    <button class="ghost" data-action="start-demo">Continue in demo mode</button>
                  </div>`
               : ""
           }`
        : "";

    const micBlock = view.micBlocked
      ? `<div class="mic" role="alert">
           <strong>Microphone blocked.</strong>
           <p class="muted">PyAI is connected — the browser refused capture. Allow the microphone for this site, then press End and start again.</p>
         </div>`
      : "";

    const runningBlock = view.running
      ? `<p class="status">${esc(view.checking ? "Checking your page…" : view.status)}</p>
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
      ? `<div class="card" data-testid="handoff-card">
           <strong>Want help by phone?</strong>
           <p class="muted">We can start a new phone session on ${esc(view.helpNumber)}.
           Your session reference and current step go with it. This is a new call, not a transfer.</p>
           <div class="actions">
             <button class="primary" data-action="accept">Yes, call me</button>
             <button class="ghost" data-action="decline">No thanks</button>
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
                    `<p><span>${l.role === "user" ? "You" : "Guide"}</span>${esc(l.text)}</p>`
                )
                .join("")
            : `<p class="muted">Nothing spoken yet.</p>`
        }</div>`
      : "";

    this.container.innerHTML = `
      <div class="head">
        <span class="dot ${view.running ? "on" : ""}"></span>
        <span class="title">Minute One</span>
        <span class="step">${
          view.running && view.stepCount
            ? `Step ${Math.min(view.stepIndex + 1, view.stepCount)} of ${view.stepCount}`
            : ""
        }</span>
      </div>
      ${proofBlock}${micBlock}${startBlock}${runningBlock}${handoffBlock}${terminalBlock}${transcriptBlock}`;
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
