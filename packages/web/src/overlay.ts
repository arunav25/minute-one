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
  /*
   * Still reported, deliberately not rendered.
   *
   * "Step 1 of 6" is the journey author's count, not the user's business: it
   * says nothing they can act on, and a long number early on reads as a chore.
   * The console keeps it, where progress per step is exactly the point.
   */
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
    <stop offset="0" stop-color="#7A50F5"/><stop offset=".45" stop-color="#A487FF"/>
    <stop offset="1" stop-color="#F5E6D3"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="17" fill="url(#mo-g)"/>
  <path d="M20 41V29a6 6 0 0 1 12 0v12M32 29a6 6 0 0 1 12 0v12"
        fill="none" stroke="#fff" stroke-width="5.8" stroke-linecap="round"/>
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
  position: fixed; bottom: 16px; right: 16px; width: 330px;
  max-height: calc(100vh - 32px); overflow-y: auto;
  background: #fff; color: #16141f; border: 1px solid #e6e3f2;
  border-radius: 16px; padding: 14px; z-index: 2147483000;
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  box-shadow: 0 18px 50px rgba(22,20,31,.16);
}
/* The header doubles as the drag handle, so it says so on hover. */
.head { display:flex; align-items:center; gap:8px; margin-bottom:12px; cursor:grab; user-select:none; touch-action:none; }
.head.dragging { cursor:grabbing; }
.icon-btn { margin-left:auto; flex:none; width:24px; height:24px; display:grid; place-items:center;
  border:0; border-radius:7px; background:none; color:#9a97ac; font-size:15px; line-height:1; cursor:pointer; }
.icon-btn:hover { background:#f4f2fc; color:#16141f; }

/* ---- minimised ----
 * Collapses to an orb that keeps signalling. A guide that is still listening
 * must not look switched off, or the user talks to something they think is
 * gone — the rings are the only thing telling them the microphone is live.
 */
.wrap { animation: mo-grow .18s cubic-bezier(.2,.8,.3,1); transform-origin: bottom right; }
@keyframes mo-grow {
  from { opacity:0; transform:scale(.92) translateY(6px); }
  to   { opacity:1; transform:scale(1)   translateY(0);   }
}
.wrap.min { width:auto; max-height:none; padding:0; overflow:visible;
  background:transparent; border:0; box-shadow:none; animation:none; }
.orb { transition: transform .16s ease, box-shadow .16s ease; }
.orb:hover { transform: scale(1.06); box-shadow:0 14px 34px rgba(22,20,31,.28); }
.orb:active { transform: scale(.97); }
.orb { position:relative; width:56px; height:56px; padding:0; border:0; border-radius:50%;
  background:#fff; box-shadow:0 10px 30px rgba(22,20,31,.22); cursor:pointer;
  display:grid; place-items:center; }
.orb .logo { width:30px; height:30px; }
.orb .ring { position:absolute; inset:-2px; border-radius:50%; border:2px solid #7c5cff;
  opacity:0; pointer-events:none; }
.orb.live .ring { animation: mo-pulse 2.4s cubic-bezier(.2,.6,.3,1) infinite; }
.orb.live .ring:nth-of-type(2) { animation-delay:.8s; }
.orb.live .ring:nth-of-type(3) { animation-delay:1.6s; }
/* Speaking is faster and reaches further — the difference between the agent
   talking and waiting for you is legible from across the desk. */
.orb.speaking .ring { animation-duration:1.2s; border-color:#5c34e0; }
@keyframes mo-pulse {
  0%   { transform:scale(1);    opacity:.5; }
  100% { transform:scale(2.05); opacity:0; }
}
@media (prefers-reduced-motion: reduce) {
  .orb.live .ring { animation:none; opacity:.35; transform:scale(1.25); }
}
.logo { display:block; flex:none; border-radius:7px; }
.dot { width:8px; height:8px; border-radius:50%; background:#c9c5d8; flex:none; }
.dot.on { background:#7c5cff; box-shadow:0 0 0 3px rgba(124,92,255,.18); }
.title { font-weight:700; letter-spacing:-.01em; }
.brand { color:#9a97ac; font-size:11px; }
.stage { display:inline-block; margin:0 0 8px; padding:3px 9px; border-radius:999px;
  border:1px solid #e6e3f2; background:#f4f2fc; color:#6b6880;
  font-family:ui-monospace,Menlo,monospace; font-size:10.5px; letter-spacing:.07em; text-transform:uppercase; }
.target-note { margin:0 0 10px; color:#b26b00; font-size:12.5px; }
.sr-live { position:absolute; width:1px; height:1px; overflow:hidden;
  clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; }
.demo-note { border:1px solid #f0d9a8; background:#fdf6e7; color:#6b4a06; border-radius:10px; padding:9px 11px; margin-bottom:12px; font-size:12.5px; }
.connecting { margin:0 0 12px; color:#6f6b81; font-size:13px; }
.not-yet { margin:8px 0 0; color:#6f6b81; font-size:13px; }
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
  /*
   * Starts collapsed.
   *
   * The guide opens on somebody else's screen, uninvited. A 330px panel over
   * their header is an interruption; an orb is an offer. It also gives the
   * running session a permanent, unobtrusive home — the pulse is what says a
   * call is in progress once the panel is out of the way.
   */
  private minimised = true;
  /** Set once the panel has been dragged; until then it stays pinned bottom-right. */
  private pos: { x: number; y: number } | null = null;
  /** True when the last pointer sequence travelled far enough to be a drag. */
  private draggedFar = false;
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

    this.installDragging();

    this.container.addEventListener("click", (event) => {
      // `closest`, not the target itself: a click on the orb lands on the
      // inlined <svg> or one of the rings, and neither carries the attribute.
      const action = (event.target as HTMLElement)?.closest?.("[data-action]")
        ?.getAttribute("data-action");
      if (!action) return;
      // A drag that ends over the control is not a press of it.
      if (this.draggedFar) return;
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
        case "minimise":
        case "expand":
          this.minimised = action === "minimise";
          if (this.view) this.render(this.view);
          return;
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

  /**
   * Drag by the header, anywhere in the window.
   *
   * The panel is pinned top-right, which is exactly where a lot of products put
   * their own controls — so it has to be movable, or it covers the thing the
   * guide is telling you to click. Pointer events (not mouse) so it works with
   * a trackpad, a touchscreen and a pen; capture so a fast drag that outruns
   * the cursor does not drop the panel.
   *
   * Position is clamped on release and on resize: a panel dragged off-screen,
   * or left off-screen by a window resize, cannot be dragged back.
   */
  private installDragging() {
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    let dragging = false;
    let captured = false;

    const head = () => this.root.querySelector<HTMLElement>(".head");

    this.container.addEventListener("pointerdown", (e) => {
      const target = e.target as HTMLElement;
      const onOrb = Boolean(target.closest?.(".orb"));
      // The header drags the panel; the orb drags itself. Buttons inside the
      // header keep their own behaviour — but the orb *is* a button, so it is
      // allowed through and a press is told from a drag by distance below.
      if (!onOrb && (!target.closest?.(".head") || target.closest?.("button"))) {
        return;
      }
      this.draggedFar = false;
      captured = false;
      const rect = this.container.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      dragging = true;
      head()?.classList.add("dragging");
      /*
       * Capture is taken on the first real movement, not here.
       *
       * Capturing on pointerdown retargets the click that follows to the
       * capturing element, so a plain press on the orb arrived with the panel
       * as its target and no action attached — the orb simply would not open.
       *
       * Nor is preventDefault called here: on pointerdown it suppresses the
       * compatibility mouse events, and the click along with them. Text
       * selection is already handled by user-select in the stylesheet.
       */
    });

    this.container.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // A few pixels of travel is a press with a shaky hand, not a drag.
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.draggedFar = true;
      if (this.draggedFar && !captured) {
        this.container.setPointerCapture(e.pointerId);
        captured = true;
      }
      if (!this.draggedFar) return;
      this.place(originX + dx, originY + dy);
    });

    const stop = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      head()?.classList.remove("dragging");
      if (captured) {
        this.container.releasePointerCapture?.(e.pointerId);
        captured = false;
      }
      if (this.pos) this.place(this.pos.x, this.pos.y);
    };
    this.container.addEventListener("pointerup", stop);
    this.container.addEventListener("pointercancel", stop);

    window.addEventListener("resize", () => {
      if (this.pos) this.place(this.pos.x, this.pos.y);
    });
  }

  /** Move the panel, clamped so it can always be grabbed again. */
  private place(x: number, y: number) {
    const rect = this.container.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width - 8);
    const maxY = Math.max(0, window.innerHeight - rect.height - 8);
    const clamped = {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    };
    this.pos = clamped;
    this.container.style.left = `${clamped.x}px`;
    this.container.style.top = `${clamped.y}px`;
    // `right`/`bottom` are what pin it by default; both have to go or the
    // left/top just set are ignored.
    this.container.style.right = "auto";
    this.container.style.bottom = "auto";
  }

  render(view: OverlayView) {
    this.view = view;

    if (this.minimised) {
      const speaking = view.stage === "Speaking";
      /*
       * "Live" means the microphone is open, which is the provider connection —
       * not `running`, which only turns true once the journey's controller has
       * started. Keyed on `running`, the orb sat perfectly still while the agent
       * was mid-sentence: the one moment it most needs to look alive.
       */
      const connection = view.proof?.connection;
      const live =
        view.running || connection === "connected" || connection === "reconnecting";
      this.container.className = "wrap min";
      this.container.innerHTML = `
        <button class="orb ${live ? "live" : ""} ${speaking ? "speaking" : ""}"
                data-action="expand" aria-label="${
                  live
                    ? `Minute One is ${speaking ? "speaking" : "listening"} — open the guide`
                    : "Open the Minute One guide"
                }" title="${live ? (speaking ? "Speaking" : "Listening") : "Open"}">
          <span class="ring"></span><span class="ring"></span><span class="ring"></span>
          ${LOGO}
        </button>`;
      const announcement = view.stage ?? view.terminal ?? "";
      if (announcement && this.live.textContent !== announcement) {
        this.live.textContent = announcement;
      }
      // Clamp: the orb is much smaller than the panel it replaced.
      if (this.pos) this.place(this.pos.x, this.pos.y);
      return;
    }
    this.container.className = "wrap";

    const real = view.proof?.isRealVoice ?? false;

    /*
     * What the person being guided sees about voice — and no more.
     *
     * This panel sits inside someone else's product, in front of their
     * customer. Which speech vendor we called, the model string, the provider
     * session id and the minutes billed are our operational concerns, not
     * theirs: they belong in the Minute One console, where the team that
     * installed the guide can see them. Showing them here reads as debug
     * output leaking into a live product.
     *
     * Two things do survive, because they are the user's business rather than
     * ours: that the microphone is open, and that a demo is not the real
     * thing. Dropping the second would make the panel quietly dishonest.
     */
    const connecting =
      view.proof?.connection === "connecting" ||
      view.proof?.connection === "reconnecting";

    const voiceBlock = !view.proof
      ? ""
      : !real
        ? `<div class="demo-note" data-testid="demo-note">
             <strong>Demo mode.</strong> A scripted preview — nobody is listening.
           </div>`
        : connecting
          ? `<p class="connecting" data-testid="voice-status">Connecting…</p>`
          : "";

    const startBlock =
      !view.running && !view.terminal
        ? `<button class="primary" data-action="start-real">Start voice guide</button>
           ${
             /*
              * The provider's own error text is not shown.
              *
              * It names the vendor and its API — "Deepgram error: Error parsing
              * client message. Check the agent.think field against the API
              * spec." — which tells the user nothing they can act on and leaks
              * which shell we run on. It goes to the browser console for
              * whoever installed the guide, and to the session event for the
              * console; the user gets a sentence they can act on.
              */
             view.connectionError
               ? `<div class="error" role="alert">
                    <p><strong>The voice guide couldn't start.</strong> Check your connection and try again.</p>
                    <p class="muted">Or continue with a scripted preview — nobody is listening in that mode.</p>
                    <button class="ghost" data-action="start-demo">Continue without voice</button>
                  </div>`
               : ""
           }`
        : "";

    const micBlock = view.micBlocked
      ? `<div class="mic" role="alert">
           <strong>I can't hear you.</strong>
           <p class="muted">Your browser is blocking the microphone for this site. Allow it, then press End and start again.</p>
         </div>`
      : "";

    const runningBlock = view.running
      ? `${view.stage ? `<span class="stage" data-testid="stage">${esc(view.stage)}</span>` : ""}
         <p class="status">${esc(view.checking ? "Checking your page…" : view.status)}</p>
         ${view.targetNote ? `<p class="target-note" data-testid="target-note">${esc(view.targetNote)}</p>` : ""}
         ${view.instruction ? `<p class="instruction" data-testid="instruction">${emphasise(view.instruction, view.targetLabel)}</p>` : ""}
         ${
           /*
            * A failed check used to print the verifier's own evidence rules
            * ("visible_text: will be shared with…"), which is the language of
            * the journey author, not of the person stuck on the screen. The
            * spoken recovery already tells them what to try; here we only say,
            * plainly, that it is not confirmed yet. The rules themselves stay
            * in the console, where whoever authored the step can act on them.
            */
           view.missing.length
             ? `<p class="not-yet" data-testid="not-yet">Not quite yet — I can't see that on the page.</p>`
             : ""
         }
         <div class="actions">
           <!--
             Kept, renamed. It locks onto the journey this product has authored,
             which is what someone reaches for when the guide has not understood
             them — and the only way to pick a goal when nothing is listening,
             as in demo mode. "Use supported goal" was our word for it.
           -->
           <button class="ghost" data-action="goal">Start the walkthrough</button>
           <button class="ghost" data-action="transcript">${
             this.transcriptOpen ? "Hide transcript" : "Transcript"
           }</button>
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

    /*
     * No link to the session report.
     *
     * The report is Minute One's own instrumentation — step timings, failed
     * checks, provider minutes — written for the team that installed the guide
     * and read in the console. Offering it to the guided user sent them into a
     * different product's dashboard to look at telemetry about themselves.
     */
    /*
     * The engine's own reason string never reaches the user.
     *
     * "user ended before any step passed" is audit language: precise, useful in
     * the console, and meaningless-to-alarming on someone's screen — it reads
     * as a failure when the user simply closed the guide. The exact reason is
     * still recorded on the session event, which is where it belongs.
     */
    const terminalBlock = view.terminal
      ? `<div class="card ${view.terminal}" data-testid="terminal">
           <strong>${esc(TERMINAL_TITLE[view.terminal] ?? "Finished")}</strong>
           <p class="muted">${esc(TERMINAL_NOTE[view.terminal] ?? "")}</p>
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
        <button class="icon-btn" data-action="minimise" aria-label="Minimise the guide"
                title="Minimise">&minus;</button>
      </div>
      ${voiceBlock}${micBlock}${startBlock}${runningBlock}${handoffBlock}${terminalBlock}${transcriptBlock}`;

    /*
     * Keep the transcript on the newest line.
     *
     * render() rebuilds the node, so it comes back scrolled to the top and the
     * line just spoken sits below the fold — you had to scroll after every turn
     * to read a conversation you are in the middle of having.
     */
    const log = this.root.querySelector<HTMLElement>(".transcript");
    if (log) log.scrollTop = log.scrollHeight;

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

/**
 * How a finished session is announced to the person who was guided.
 *
 * The engine's own vocabulary — completed, partial, failed, deadline — is a
 * status the console reports on. Said to a user mid-product it reads like an
 * error code, so each maps to plain language here.
 */
const TERMINAL_TITLE: Record<string, string> = {
  completed: "All done",
  partial: "Stopped here",
  failed: "We couldn't finish this",
  deadline: "Out of time",
};

/**
 * The sub-line under each outcome. Written for someone who was using the
 * product, not for whoever authored the journey — "partial" most often means
 * the person simply closed the guide, which is not a failure and should not
 * read like one.
 */
const TERMINAL_NOTE: Record<string, string> = {
  completed: "You're set up. You can close this.",
  partial: "You can pick this up again whenever you like.",
  // No offer to fetch a human: Minute One cannot summon one, and a promise it
  // cannot keep is worse than no offer.
  failed: "Nothing was changed in your account. You can try again.",
  deadline: "The guide timed out. Start again when you have a moment.",
};
