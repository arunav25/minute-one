import type {
  ControlState,
  ObservedControl,
  ObservedNotice,
  PageSnapshot,
} from "@minute-one/core";
import { sanitise } from "./redaction";

/**
 * Reads a redacted semantic snapshot of the live page.
 *
 * Generic on purpose: it knows about ARIA roles, accessible names and visible
 * text, not about any particular product. Which landmarks matter is the
 * application layer's business (`src/apps/*`), expressed as verification rules.
 *
 * Raw HTML never leaves this module.
 */

export type ObserverLimits = {
  maxControls: number;
  maxTextChars: number;
  debounceMs: number;
};

export const DEFAULT_LIMITS: ObserverLimits = {
  maxControls: 80,
  maxTextChars: 4000,
  debounceMs: 300,
};

const CONTROL_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[role=option]",
  "[role=menuitem]",
  "[role=checkbox]",
  "[role=radio]",
].join(",");

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Accessible name, roughly following the ARIA precedence order. */
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
    if (el.name) return el.name;
  }

  const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
  if (text.trim()) return text;

  return el.getAttribute("title") ?? el.getAttribute("data-testid") ?? "";
}

function roleOf(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "input") return (el as HTMLInputElement).type || "textbox";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  return tag;
}

function stateOf(el: Element): ControlState | undefined {
  const disabled =
    (el as HTMLButtonElement).disabled ||
    el.getAttribute("aria-disabled") === "true";
  if (disabled) return "disabled";

  const selected =
    el.getAttribute("aria-selected") === "true" ||
    el.getAttribute("aria-current") === "true" ||
    el.getAttribute("data-selected") === "true";
  if (selected) return "selected";

  const expanded = el.getAttribute("aria-expanded");
  if (expanded === "true") return "expanded";

  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    return el.checked ? "checked" : "enabled";
  }
  if (el.getAttribute("aria-checked") === "true") return "checked";

  return "enabled";
}

/** Password values are never read, redacted or otherwise. */
function isSensitiveInput(el: Element): boolean {
  return el instanceof HTMLInputElement && el.type === "password";
}

function noticeKind(el: Element): ObservedNotice["kind"] {
  const hint = `${el.className} ${el.getAttribute("data-kind") ?? ""} ${
    el.getAttribute("role") ?? ""
  }`.toLowerCase();
  if (hint.includes("error") || hint.includes("danger") || hint.includes("alert"))
    return "error";
  if (hint.includes("success") || hint.includes("confirm")) return "success";
  return "info";
}

/** FNV-1a. Same visible state must produce the same fingerprint. */
function fingerprintOf(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function snapshotDocument(
  doc: Document = document,
  limits: ObserverLimits = DEFAULT_LIMITS
): PageSnapshot {
  const headings = Array.from(doc.querySelectorAll("h1,h2,h3,[role=heading]"))
    .filter(isVisible)
    .slice(0, 10)
    .map((el) => sanitise((el as HTMLElement).innerText ?? "", 120))
    .filter(Boolean);

  const controls: ObservedControl[] = Array.from(
    doc.querySelectorAll(CONTROL_SELECTOR)
  )
    .filter(isVisible)
    .filter((el) => !isSensitiveInput(el))
    .slice(0, limits.maxControls)
    .map((el, index) => ({
      id: el.getAttribute("data-testid") ?? el.id ?? `control-${index}`,
      role: roleOf(el),
      name: sanitise(accessibleName(el), 80),
      state: stateOf(el),
    }))
    .filter((c) => c.name.length > 0);

  const dialogs = Array.from(
    doc.querySelectorAll("[role=dialog],[role=alertdialog],dialog[open]")
  )
    .filter(isVisible)
    .slice(0, 5)
    .map((el) =>
      sanitise(
        el.getAttribute("aria-label") ??
          el.querySelector("h1,h2,h3")?.textContent ??
          "dialog",
        80
      )
    );

  const notices: ObservedNotice[] = Array.from(
    doc.querySelectorAll("[role=status],[role=alert],[data-notice]")
  )
    .filter(isVisible)
    .slice(0, 5)
    .map((el) => ({
      kind: noticeKind(el),
      text: sanitise((el as HTMLElement).innerText ?? "", 160),
    }))
    .filter((n) => n.text.length > 0);

  const bodyText = sanitise(
    (doc.body as HTMLElement | null)?.innerText ?? "",
    limits.maxTextChars
  );

  const route = typeof location !== "undefined" ? location.pathname : "/";
  const url = typeof location !== "undefined" ? location.href : "";

  const material = JSON.stringify({
    route,
    headings,
    dialogs,
    notices,
    text: bodyText,
    controls: controls.map((c) => [c.name, c.role, c.state]),
  });

  return {
    url,
    route,
    title: sanitise(doc.title ?? "", 120),
    headings,
    controls,
    dialogs,
    notices,
    text: bodyText,
    fingerprint: fingerprintOf(material.slice(0, limits.maxTextChars)),
    observedAt: new Date().toISOString(),
  };
}

/**
 * Live observer: debounced mutation + route watching, plus an explicit
 * `waitForChange` the controller uses to block until the page moves.
 */
export class LiveDomObserver {
  private latest: PageSnapshot;
  private listeners = new Set<(snap: PageSnapshot) => void>();
  private mutationObserver: MutationObserver | null = null;
  private timer: number | null = null;

  constructor(
    private readonly doc: Document = document,
    private readonly limits: ObserverLimits = DEFAULT_LIMITS
  ) {
    this.latest = snapshotDocument(doc, limits);
  }

  start() {
    if (this.mutationObserver) return;
    this.mutationObserver = new MutationObserver(() => this.schedule());
    this.mutationObserver.observe(this.doc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    window.addEventListener("popstate", this.schedule);
    window.addEventListener("hashchange", this.schedule);
  }

  stop() {
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    window.removeEventListener("popstate", this.schedule);
    window.removeEventListener("hashchange", this.schedule);
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private schedule = () => {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.refresh();
    }, this.limits.debounceMs);
  };

  private refresh() {
    const next = snapshotDocument(this.doc, this.limits);
    if (next.fingerprint === this.latest.fingerprint) return;
    this.latest = next;
    this.listeners.forEach((fn) => fn(next));
  }

  async snapshot(): Promise<PageSnapshot> {
    this.latest = snapshotDocument(this.doc, this.limits);
    return this.latest;
  }

  onChange(fn: (snap: PageSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  waitForChange(
    fingerprint: string,
    timeoutMs: number
  ): Promise<"changed" | "timeout"> {
    return new Promise((resolve) => {
      // Guard against a change that landed between snapshot and subscribe.
      if (snapshotDocument(this.doc, this.limits).fingerprint !== fingerprint) {
        resolve("changed");
        return;
      }
      const off = this.onChange(() => {
        off();
        window.clearTimeout(timer);
        resolve("changed");
      });
      const timer = window.setTimeout(() => {
        off();
        resolve("timeout");
      }, timeoutMs);
    });
  }
}
