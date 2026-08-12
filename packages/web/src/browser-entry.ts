import { boot, fetchRuntimeConfig, type BootOptions } from "./boot";
import type { MinuteOneSettings } from "./identity";
import { MinuteOne, init, type MinuteOneConfig } from "./sdk";

/**
 * Script-tag entry point.
 *
 * The short form, when the host has nothing to tell us about the user:
 *
 *   <script src="https://your-minute-one-host/minute-one.js"
 *           data-product-key="mo_pk_…"
 *           data-autostart="false"></script>
 *
 * Or, to identify the signed-in user, set the settings object before the tag —
 * the same convention support and analytics widgets use, so it drops into the
 * place a host already has for this:
 *
 *   <script>
 *     window.minuteOneSettings = {
 *       productKey: "mo_pk_…",
 *       user: { id, email, name, createdAt, locale },
 *       company: { id, name, meta: { plan: "enterprise" } },
 *     };
 *   </script>
 *   <script src="https://your-minute-one-host/minute-one.js"></script>
 *
 * Identity is reported with sessions so a run can be traced to a real user. It
 * is not added to the voice context — see identity.ts.
 *
 * The tag auto-boots when a product key is present in either place, so the host
 * writes no imperative JavaScript. `window.MinuteOne.boot()` is there for apps
 * that would rather control the timing.
 *
 * Built to a single local file. No CDN, no auto-update channel, no remote
 * config beyond the product's own context.
 */
declare global {
  interface Window {
    MinuteOne?: {
      boot: (options: BootOptions) => Promise<MinuteOne>;
      init: (config: MinuteOneConfig) => MinuteOne;
      fetchRuntimeConfig: typeof fetchRuntimeConfig;
      version: string;
      /** Set once a tag with data-product-key has booted. */
      instance?: MinuteOne;
    };
    minuteOneSettings?: MinuteOneSettings;
  }
}

const VERSION = "0.1.0";

function currentTag(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }
  return (
    Array.from(document.scripts).find((s) => s.dataset.productKey) ?? null
  );
}

if (typeof window !== "undefined") {
  window.MinuteOne = { boot, init, fetchRuntimeConfig, version: VERSION };

  const tag = currentTag();
  const settings = window.minuteOneSettings ?? {};
  // A data attribute wins over the settings object: it sits on the tag you are
  // looking at, so that is the one a reader would expect to take effect.
  const productKey = tag?.dataset.productKey ?? settings.productKey;

  if (productKey) {
    const host = tag?.dataset.host ?? settings.host;
    const helpNumber = tag?.dataset.helpNumber ?? settings.helpNumber;
    const autostart =
      tag?.dataset.autostart === "true" ||
      (tag?.dataset.autostart === undefined && settings.autostart === true);

    const start = () => {
      boot({
        productKey,
        host,
        helpNumber,
        user: settings.user,
        company: settings.company,
        meta: settings.meta,
      })
        .then((instance) => {
          if (window.MinuteOne) window.MinuteOne.instance = instance;
          // Opt in to starting voice immediately; default is to wait for the
          // user to press the button, because a page that grabs the
          // microphone on load is hostile.
          if (autostart) void instance.start();
        })
        .catch((err) => {
          console.error("[minute-one] failed to boot:", err);
        });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }
}

export { MinuteOne, boot, init, fetchRuntimeConfig };
