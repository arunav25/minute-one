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

/**
 * Resolve a semantic description to a live element.
 * Order matters: semantics first, brittle hooks last.
 */
export function resolveTarget(target: StepTarget): HTMLElement | null {
  const root = scopeRoot(target);
  const all = Array.from(root.querySelectorAll<HTMLElement>("*")).filter(
    isVisible
  );

  if (target.role && target.name) {
    const hit = all.find(
      (el) =>
        roleOf(el) === target.role && norm(accessibleName(el)) === norm(target.name!)
    );
    if (hit) return hit;
  }

  if (target.name) {
    const exact = all.find((el) => norm(accessibleName(el)) === norm(target.name!));
    if (exact) return exact;
  }

  if (target.text) {
    const hit = all
      .filter((el) => el.children.length === 0 || roleOf(el) === "button")
      .find((el) => norm(accessibleName(el)).includes(norm(target.text!)));
    if (hit) return hit;
  }

  if (target.testId) {
    const hit = root.querySelector<HTMLElement>(
      `[data-testid="${target.testId}"]`
    );
    if (hit && isVisible(hit)) return hit;
  }

  if (target.selector) {
    const hit = root.querySelector<HTMLElement>(target.selector);
    if (hit && isVisible(hit)) return hit;
  }

  return null;
}

const STYLE = `
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
  .ring { transition: none; }
  .pulse.on { animation: none; }
}
`;

export class Spotlight {
  private ring: HTMLDivElement;
  private pulse: HTMLDivElement;
  private target: StepTarget | null = null;
  private element: HTMLElement | null = null;
  private timer: number | null = null;
  private onViewportChange: (() => void) | null = null;
  private lastRect = "";
  private scrolledFor: StepTarget | null = null;
  private warned = false;

  constructor(root: ShadowRoot) {
    const style = document.createElement("style");
    style.textContent = STYLE;

    this.ring = document.createElement("div");
    this.ring.className = "ring";
    this.pulse = document.createElement("div");
    this.pulse.className = "pulse";

    // Decoration only: invisible to assistive tech and to hit-testing, so the
    // host's own click and focus behaviour is completely unaffected.
    for (const el of [this.ring, this.pulse]) {
      el.setAttribute("aria-hidden", "true");
      el.style.pointerEvents = "none";
    }

    root.append(style, this.ring, this.pulse);
  }

  /** Point at a new target. Safe to call repeatedly with the same one. */
  show(target: StepTarget | undefined) {
    if (!target) return this.clear();
    if (this.target && sameTarget(this.target, target)) return;
    this.target = target;
    this.element = null;
    this.lastRect = "";
    this.scrolledFor = null;
    this.startTracking();
  }

  /** Remove the ring. Called between steps and on teardown. */
  clear() {
    this.target = null;
    this.element = null;
    this.ring.classList.remove("on");
    this.pulse.classList.remove("on");
    this.stopTracking();
  }

  destroy() {
    this.clear();
    this.ring.remove();
    this.pulse.remove();
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
      this.element = resolveTarget(this.target);
    }

    if (!this.element) {
      this.ring.classList.remove("on");
      this.pulse.classList.remove("on");
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
      // Top-right corner, not beside the element: a dot placed to the right
      // sits on top of whatever control is next to the target, which on a row
      // of buttons meant obscuring the very option the user must not pick.
      this.pulse.style.top = `${r.top - pad - 5}px`;
      this.pulse.style.left = `${r.right + pad - 5}px`;
    }

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
