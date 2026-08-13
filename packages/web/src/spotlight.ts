import type { StepTarget } from "@minute-one/core";

/**
 * Points at the control the current step is about, on the host's own page.
 *
 * Four rules this has to obey, because it is drawn on software we do not own:
 *
 *   1. It must never intercept a click or a key press. Everything rendered
 *      here is `pointer-events: none` and is not focusable, so the ring is
 *      decoration over the host's element, not a layer in front of it.
 *   2. It must survive the page moving underneath it — scrolling, resizing,
 *      a route change, a re-render that swaps the node.
 *   3. It must clean itself up between steps, so a stale ring never points at
 *      the wrong thing.
 *   4. It must not alter the host's DOM. The ring lives in our shadow root and
 *      is positioned over the target, rather than styling the target itself.
 */

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Accessible name, following roughly the ARIA precedence order. */
function accessibleName(el: Element): string {
  const label = el.getAttribute("aria-label");
  if (label) return label;

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }

  if (el instanceof HTMLInputElement) {
    if (el.labels?.length) return el.labels[0].textContent ?? "";
    if (el.placeholder) return el.placeholder;
  }

  return (el as HTMLElement).innerText ?? el.textContent ?? "";
}

function roleOf(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button") return "button";
  if (tag === "input") return (el as HTMLInputElement).type || "textbox";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  return tag;
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

/** Narrow the search when the manifest scopes a target to a container. */
function scopeRoot(target: StepTarget): ParentNode {
  const within = target.within;
  if (!within) return document;
  const candidates = Array.from(
    document.querySelectorAll(within.role ? `[role="${within.role}"]` : "*")
  ).filter(isVisible);
  const match = within.name
    ? candidates.find((el) =>
        norm(accessibleName(el)).includes(norm(within.name!))
      )
    : candidates[0];
  return match ?? document;
}

/** What resolution actually established, not just what it picked. */
export type TargetResolutionStatus =
  | "found"
  | "missing"
  | "ambiguous"
  | "hidden"
  | "disabled";

export type TargetResolution = {
  status: TargetResolutionStatus;
  element: HTMLElement | null;
  /** How many visible candidates matched, when that is what went wrong. */
  matches?: number;
};

function isDisabled(el: Element): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute("aria-disabled") === "true"
  );
}

/**
 * Resolve a semantic description to a live element, reporting *why* when it
 * cannot.
 *
 * Order matters: semantics first, brittle hooks last. Within a strategy the
 * result must be unique among visible elements — guessing the first of several
 * matches would spotlight a control the author never meant, which is worse
 * than showing nothing. The authored `within` scope is the disambiguator; if
 * the result is still not unique the status is `ambiguous` and no element is
 * chosen.
 */
export function resolveTargetDetailed(target: StepTarget): TargetResolution {
  const root = scopeRoot(target);
  const everything = Array.from(root.querySelectorAll<HTMLElement>("*"));
  const all = everything.filter(isVisible);

  let sawHidden = false;
  let ambiguous: number | null = null;

  const judge = (visibleHits: HTMLElement[], hiddenHits: number): TargetResolution | null => {
    if (visibleHits.length === 1) {
      const el = visibleHits[0];
      return { status: isDisabled(el) ? "disabled" : "found", element: el };
    }
    if (visibleHits.length > 1) {
      ambiguous = ambiguous ?? visibleHits.length;
      return null;
    }
    if (hiddenHits > 0) sawHidden = true;
    return null;
  };

  if (target.role && target.name) {
    const match = (el: HTMLElement) =>
      roleOf(el) === target.role &&
      norm(accessibleName(el)) === norm(target.name!);
    const result = judge(
      all.filter(match),
      everything.filter((el) => !isVisible(el) && match(el)).length
    );
    if (result) return result;
  }

  if (target.name) {
    const match = (el: HTMLElement) =>
      norm(accessibleName(el)) === norm(target.name!);
    const result = judge(
      all.filter(match),
      everything.filter((el) => !isVisible(el) && match(el)).length
    );
    if (result) return result;
  }

  if (target.text) {
    const candidates = all
      .filter((el) => el.children.length === 0 || roleOf(el) === "button")
      .filter((el) => norm(accessibleName(el)).includes(norm(target.text!)));
    const result = judge(candidates, 0);
    if (result) return result;
  }

  if (target.testId) {
    const hits = Array.from(
      root.querySelectorAll<HTMLElement>(`[data-testid="${target.testId}"]`)
    );
    const result = judge(hits.filter(isVisible), hits.filter((el) => !isVisible(el)).length);
    if (result) return result;
  }

  if (target.selector) {
    const hits = Array.from(root.querySelectorAll<HTMLElement>(target.selector));
    const result = judge(hits.filter(isVisible), hits.filter((el) => !isVisible(el)).length);
    if (result) return result;
  }

  if (ambiguous !== null) {
    return { status: "ambiguous", element: null, matches: ambiguous };
  }
  return { status: sawHidden ? "hidden" : "missing", element: null };
}

/** Compatibility wrapper for callers that only care about the happy path. */
export function resolveTarget(target: StepTarget): HTMLElement | null {
  const r = resolveTargetDetailed(target);
  return r.status === "found" ? r.element : null;
}

const STYLE = `
/* One element, two jobs: its border is the cutout's edge, and its enormous
   spread shadow is the dimmed page around it. A single rounded rectangle gives
   a clean cutout without stitching four mask panels together. */
.mask {
  position: fixed;
  box-sizing: border-box;
  border-radius: 12px;
  pointer-events: none;
  /* Tuned for light host pages. The old .45 black was set when everything here
     was dark; over a white application it reads as switching the lights off
     rather than pointing at something. */
  box-shadow: 0 0 0 200vmax rgba(22, 20, 31, .22);
  transition: opacity .2s ease;
  opacity: 0;
  /* Below the ring and pulse, and below the instruction panel (2147483000). */
  z-index: 2147482998;
}
.mask.on { opacity: 1; }
.ring {
  position: fixed;
  /* :host { all: initial } resets box-sizing to content-box, which would make
     the ring wider than the element by twice the border. */
  box-sizing: border-box;
  border-radius: 10px;
  pointer-events: none;
  border: 2px solid #7c5cff;
  box-shadow: 0 0 0 4px rgba(124, 92, 255, .18);
  /* Only opacity animates. Transitioning position would make the ring trail
     the element on every scroll, and a spotlight that lags its target is
     worse than one that simply snaps to it. */
  transition: opacity .15s ease;
  opacity: 0;
  z-index: 2147482999;
}
.ring.on { opacity: 1; }
.pulse {
  position: fixed;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #7c5cff;
  pointer-events: none;
  opacity: 0;
  z-index: 2147483000;
}
.pulse.on { opacity: 1; animation: p 1.8s ease-out infinite; }
@keyframes p {
  0%   { box-shadow: 0 0 0 0 rgba(124,92,255,.55); }
  70%  { box-shadow: 0 0 0 12px rgba(124,92,255,0); }
  100% { box-shadow: 0 0 0 0 rgba(124,92,255,0); }
}
@media (prefers-reduced-motion: reduce) {
  .ring, .mask { transition: none; }
  .pulse.on { animation: none; }
}
`;

export class Spotlight {
  private mask: HTMLDivElement;
  private ring: HTMLDivElement;
  private pulse: HTMLDivElement;
  private target: StepTarget | null = null;
  private element: HTMLElement | null = null;
  private timer: number | null = null;
  private onViewportChange: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastRect = "";
  private lastStatus: TargetResolutionStatus | null = null;
  private scrolledFor: StepTarget | null = null;
  private warned = false;

  constructor(
    root: ShadowRoot,
    /**
     * Fired when what resolution established changes — found, missing,
     * ambiguous, hidden, disabled — so the overlay can say why there is no
     * ring instead of leaving a silent gap. Purely informational: it must
     * never feed the verification gate.
     */
    private readonly onResolution?: (status: TargetResolutionStatus) => void
  ) {
    const style = document.createElement("style");
    style.textContent = STYLE;

    this.mask = document.createElement("div");
    this.mask.className = "mask";
    this.ring = document.createElement("div");
    this.ring.className = "ring";
    this.pulse = document.createElement("div");
    this.pulse.className = "pulse";

    // Decoration only: invisible to assistive tech and to hit-testing, so the
    // host's own click and focus behaviour is completely unaffected.
    for (const el of [this.mask, this.ring, this.pulse]) {
      el.setAttribute("aria-hidden", "true");
      el.style.pointerEvents = "none";
    }

    root.append(style, this.mask, this.ring, this.pulse);
  }

  /** Point at a new target. Safe to call repeatedly with the same one. */
  show(target: StepTarget | undefined) {
    if (!target) return this.clear();
    if (this.target && sameTarget(this.target, target)) return;
    this.target = target;
    this.element = null;
    this.lastRect = "";
    this.lastStatus = null;
    this.scrolledFor = null;
    this.startTracking();
  }

  /** Remove the ring and mask. Called between steps and on teardown. */
  clear() {
    this.target = null;
    this.element = null;
    this.lastStatus = null;
    this.hideVisuals();
    this.stopTracking();
  }

  destroy() {
    this.clear();
    this.mask.remove();
    this.ring.remove();
    this.pulse.remove();
  }

  private hideVisuals() {
    this.mask.classList.remove("on");
    this.ring.classList.remove("on");
    this.pulse.classList.remove("on");
  }

  private report(status: TargetResolutionStatus) {
    if (status === this.lastStatus) return;
    this.lastStatus = status;
    this.onResolution?.(status);
  }

  /*
   * Interval plus viewport listeners rather than requestAnimationFrame.
   * rAF is suspended whenever the page is hidden or occluded, which leaves the
   * ring frozen or unplaced; a timer keeps working (throttled, which is fine)
   * and the listeners keep scrolling smooth.
   */
  private startTracking() {
    this.update();
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.update(), 200);
    this.onViewportChange = () => this.update();
    window.addEventListener("scroll", this.onViewportChange, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", this.onViewportChange, { passive: true });
  }

  private stopTracking() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.onViewportChange) {
      window.removeEventListener("scroll", this.onViewportChange, true);
      window.removeEventListener("resize", this.onViewportChange);
      this.onViewportChange = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  /**
   * Follow the target's own size, not just the viewport's. A panel expanding
   * above the target moves it without any scroll or resize event; the interval
   * would catch it eventually, but 200ms of a ring floating next to nothing is
   * visible. Re-attached whenever a framework swaps the node.
   */
  private observeElement(el: HTMLElement) {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.update());
    this.resizeObserver.observe(el);
    // The target moves when an ancestor resizes too, and the body catches the
    // "content above it expanded" case without observing every ancestor.
    if (document.body) this.resizeObserver.observe(document.body);
  }

  /**
   * Re-resolves whenever the element is gone. A framework re-render or a route
   * change replaces nodes, and the ring has to find the new one rather than
   * point at a detached node.
   */
  /**
   * Guarded: this runs on a timer inside someone else's page, and an exception
   * escaping here would be an error in their console every 200ms.
   */
  private update() {
    try {
      this.track();
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn("[minute-one] spotlight tracking stopped:", err);
      }
      this.stopTracking();
    }
  }

  private track() {
    if (!this.target) return;

    if (!this.element || !this.element.isConnected || !isVisible(this.element)) {
      const resolution = resolveTargetDetailed(this.target);
      this.report(resolution.status);
      const next = resolution.status === "found" ? resolution.element : null;
      if (next && next !== this.element) this.observeElement(next);
      this.element = next;
    } else if (isDisabled(this.element)) {
      // The node is still there but the host disabled it — an active ring on a
      // control the user cannot press is an instruction to do the impossible.
      this.report("disabled");
      this.element = null;
    } else {
      this.report("found");
    }

    if (!this.element) {
      this.hideVisuals();
      // Forget the last geometry. Otherwise a target that disappears and
      // returns at the same position matches the cache below, skips the
      // repaint, and never becomes visible again.
      this.lastRect = "";
      return;
    }

    const r = this.element.getBoundingClientRect();
    const key = `${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`;
    const moved = key !== this.lastRect;
    this.lastRect = key;

    const pad = 4;
    if (moved) {
      this.ring.style.top = `${r.top - pad}px`;
      this.ring.style.left = `${r.left - pad}px`;
      this.ring.style.width = `${r.width + pad * 2}px`;
      this.ring.style.height = `${r.height + pad * 2}px`;
      // The mask's cutout hugs the same rectangle, slightly looser so the ring
      // reads as inside the lit area rather than clipped by it.
      const maskPad = pad + 4;
      this.mask.style.top = `${r.top - maskPad}px`;
      this.mask.style.left = `${r.left - maskPad}px`;
      this.mask.style.width = `${r.width + maskPad * 2}px`;
      this.mask.style.height = `${r.height + maskPad * 2}px`;
      // Top-right corner, not beside the element: a dot placed to the right
      // sits on top of whatever control is next to the target, which on a row
      // of buttons meant obscuring the very option the user must not pick.
      this.pulse.style.top = `${r.top - pad - 5}px`;
      this.pulse.style.left = `${r.right + pad - 5}px`;
    }

    this.mask.classList.add("on");
    this.ring.classList.add("on");
    this.pulse.classList.add("on");

    // Bring it into view once per target — never repeatedly, which would
    // fight a user who has deliberately scrolled away.
    if (this.scrolledFor !== this.target && !inViewport(r)) {
      this.scrolledFor = this.target;
      this.element.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

function inViewport(r: DOMRect): boolean {
  return r.top >= 0 && r.bottom <= window.innerHeight;
}

function sameTarget(a: StepTarget, b: StepTarget): boolean {
  return (
    a.label === b.label &&
    a.role === b.role &&
    a.name === b.name &&
    a.text === b.text &&
    a.testId === b.testId &&
    a.selector === b.selector
  );
}
