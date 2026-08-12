/**
 * Who the guide is helping, as told by the host application.
 *
 * The host page already knows its signed-in user; the guide does not, and it
 * must never try to scrape it off the page. So the host passes it in, the same
 * way analytics and support widgets take a settings object.
 *
 * Two rules this module exists to enforce:
 *
 *   1. Identity is reported with sessions, so a session can be traced to a real
 *      user. It is NOT added to the voice context. `redaction.ts` goes to
 *      trouble keeping names, emails and numbers out of what reaches the model;
 *      accepting an email here and then handing it to the voice provider would
 *      undo that in one line. If personalised speech is ever wanted it needs to
 *      be a separate, explicit opt-in.
 *   2. Only scalars survive. A host can attach arbitrary `meta`, and arbitrary
 *      means a nested object, a DOM node, or a whole user record. Flattening to
 *      capped scalars keeps one careless integration from posting a page's worth
 *      of data on every event flush.
 */

export type MinuteOneUser = {
  id?: string;
  email?: string;
  name?: string;
  /** ISO string or epoch seconds — whatever the host already has. */
  createdAt?: string | number;
  locale?: string;
};

export type MinuteOneCompany = {
  id?: string;
  name?: string;
  meta?: Record<string, unknown>;
};

/** What a host page assigns to `window.minuteOneSettings`. */
export type MinuteOneSettings = {
  productKey?: string;
  host?: string;
  helpNumber?: string;
  autostart?: boolean;
  user?: MinuteOneUser;
  company?: MinuteOneCompany;
  meta?: Record<string, unknown>;
};

export type SessionIdentity = {
  userId?: string;
  email?: string;
  name?: string;
  createdAt?: string;
  locale?: string;
  companyId?: string;
  companyName?: string;
  meta?: Record<string, string>;
};

const MAX_META_KEYS = 20;
const MAX_VALUE_CHARS = 200;

const str = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return undefined;
  const text = String(value).trim();
  return text ? text.slice(0, MAX_VALUE_CHARS) : undefined;
};

/** Epoch seconds, epoch milliseconds and ISO strings all arrive in the wild. */
function isoDate(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") {
    // Seconds if it is too small to be a plausible millisecond timestamp.
    const ms = value < 1e11 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? str(value) : date.toISOString();
}

function flatten(meta: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (Object.keys(out).length >= MAX_META_KEYS) break;
    const text = str(value);
    if (text !== undefined) out[key.slice(0, 40)] = text;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build the reportable identity, dropping anything empty so the console can
 * distinguish "the host passed nothing" from "the host passed a blank string".
 */
export function normaliseIdentity(
  settings: Pick<MinuteOneSettings, "user" | "company" | "meta">
): SessionIdentity | undefined {
  const { user, company, meta } = settings;

  const identity: SessionIdentity = {
    userId: str(user?.id),
    email: str(user?.email),
    name: str(user?.name),
    createdAt: isoDate(user?.createdAt),
    locale: str(user?.locale),
    companyId: str(company?.id),
    companyName: str(company?.name),
    meta: { ...(flatten(company?.meta) ?? {}), ...(flatten(meta) ?? {}) },
  };

  if (identity.meta && Object.keys(identity.meta).length === 0) {
    delete identity.meta;
  }
  for (const key of Object.keys(identity) as (keyof SessionIdentity)[]) {
    if (identity[key] === undefined) delete identity[key];
  }

  return Object.keys(identity).length > 0 ? identity : undefined;
}
