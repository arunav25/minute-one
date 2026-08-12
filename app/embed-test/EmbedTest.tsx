"use client";

import { useEffect, useState } from "react";

/**
 * A stand-in "someone else's product" page.
 *
 * The only Minute One code here is a script tag injected at runtime with a
 * product key — exactly what a host application would paste. This page imports
 * no SDK module and knows nothing about flows, controllers or PyAI.
 */
export function EmbedTest() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<string>("no script loaded");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("key");
    if (fromUrl) setKey(fromUrl);
  }, []);

  const inject = () => {
    if (!key.trim()) return;
    document
      .querySelectorAll("script[data-product-key]")
      .forEach((s) => s.remove());
    document.querySelectorAll("minute-one-overlay").forEach((s) => s.remove());

    const tag = document.createElement("script");
    tag.src = "/minute-one.js";
    tag.dataset.productKey = key.trim();
    tag.onload = () => setStatus("script loaded — overlay should appear");
    tag.onerror = () => setStatus("script failed to load");
    document.body.appendChild(tag);
    setStatus("injecting…");
  };

  return (
    <main className="et">
      <p className="tag">Third-party page · not a Minute One product</p>
      <h1>Acme Scheduling</h1>
      <p className="cs-muted">
        A deliberately plain page standing in for one of your beta products. It
        contains no Minute One code beyond the tag injected below.
      </p>

      <div className="et-panel">
        <h2>Embed the script</h2>
        <input
          data-testid="embed-key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="mo_pk_…"
          aria-label="Product key"
        />
        <div className="et-fake">
          <button data-testid="inject" onClick={inject}>
            Inject script tag
          </button>
        </div>
        <p className="cs-muted" data-testid="embed-status">
          {status}
        </p>
      </div>

      <div className="et-panel">
        <h2>Pretend product controls</h2>
        <p className="cs-muted">
          Targets for a journey to point at, so the spotlight has something real
          to find on a page that is not the JustCall fixture.
        </p>
        <div className="et-fake">
          <button>New booking</button>
          <button>Availability</button>
          <button>Team</button>
          <button>Settings</button>
        </div>
      </div>
    </main>
  );
}
