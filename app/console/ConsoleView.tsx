"use client";

import { useState } from "react";
import { api, useProductReport, useProducts } from "./console-data";
import {
  InstallPanel,
  JourneyPanel,
  KnowledgePanel,
  OverviewPanel,
  SessionsPanel,
  SettingsPanel,
  SetupPanel,
} from "./panels";

/**
 * The Minute One console.
 *
 * You create a product, tell the guide what it may know, author the journey it
 * should verify, and copy one script tag. Everything the console shows about a
 * running install comes from that product's own reported sessions.
 *
 * Deliberately unauthenticated and single-tenant — see DISCLOSURE.md.
 */

const SECTIONS = [
  {
    group: "Product",
    items: [
      { id: "overview", label: "Overview" },
      { id: "setup", label: "Setup" },
    ],
  },
  {
    group: "Configure",
    items: [
      { id: "knowledge", label: "Data sources" },
      { id: "journey", label: "Journey" },
      { id: "install", label: "Install snippet" },
      { id: "settings", label: "Settings" },
    ],
  },
  {
    group: "Monitor",
    items: [{ id: "sessions", label: "Sessions" }],
  },
];

export function ConsoleView() {
  const {
    products,
    selected,
    selectedId,
    setSelectedId,
    error,
    busy,
    loaded,
    run,
  } = useProducts();
  const { report, eventCount, identities } = useProductReport(selected?.key ?? null);

  const [section, setSection] = useState("overview");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const panelProps = selected
    ? { product: selected, report, eventCount, identities, busy, run }
    : null;

  return (
    <div className="cn">
      <aside className="cn-side">
        <div className="cn-brand">
          <img className="cn-logo" src="/brand/icon.svg" alt="" width={30} height={30} />
          <div>
            <strong>Minute One</strong>
            <span className="cn-muted">verified onboarding</span>
          </div>
        </div>

        <div className="cn-switcher">
          <label htmlFor="product-select">Product</label>
          {products.length > 0 ? (
            <select
              id="product-select"
              data-testid="product-select"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="cn-muted">None yet</p>
          )}

          {creating || products.length === 0 ? (
            <form
              className="cn-newform"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                void run(async () => {
                  const { product } = await api({ action: "create", name: newName });
                  setNewName("");
                  setCreating(false);
                  setSelectedId(product.id);
                  setSection("setup");
                });
              }}
            >
              <input
                data-testid="new-product-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="EasyCalendar"
                aria-label="New product name"
              />
              <button className="cn-primary" data-testid="create-product" disabled={busy}>
                Create
              </button>
            </form>
          ) : (
            <button className="cn-ghost cn-block" onClick={() => setCreating(true)}>
              + New product
            </button>
          )}
        </div>

        <nav className="cn-nav">
          {SECTIONS.map((g) => (
            <div key={g.group}>
              <span className="cn-nav-group">{g.group}</span>
              <ul>
                {g.items.map((item) => (
                  <li key={item.id}>
                    <button
                      data-testid={`nav-${item.id}`}
                      aria-current={section === item.id ? "page" : undefined}
                      onClick={() => setSection(item.id)}
                      disabled={!selected}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="cn-side-foot">
          <a href="/embed-test">Demo product</a>
          <a href="/report">Full report</a>
        </div>
      </aside>

      <main className="cn-main">
        {error && (
          <div className="cn-error" role="alert">
            {error}
          </div>
        )}

        {!loaded ? (
          <p className="cn-muted">Loading…</p>
        ) : !selected || !panelProps ? (
          <div className="cn-empty">
            <h3>Create your first product</h3>
            <p>
              A product is the app you want guided. You get a key, add what the
              guide may know, and paste one script tag into that app.
            </p>
          </div>
        ) : (
          <>
            <div className="cn-crumb">
              <span>{selected.name}</span>
              <span className={selected.steps.length > 0 ? "cn-pill on" : "cn-pill"}>
                {selected.steps.length > 0 ? "guided" : "answer only"}
              </span>
            </div>

            {section === "overview" && <OverviewPanel {...panelProps} />}
            {section === "setup" && <SetupPanel {...panelProps} onGo={setSection} />}
            {section === "knowledge" && <KnowledgePanel {...panelProps} />}
            {section === "journey" && <JourneyPanel {...panelProps} />}
            {section === "install" && <InstallPanel {...panelProps} />}
            {section === "settings" && <SettingsPanel {...panelProps} />}
            {section === "sessions" && <SessionsPanel {...panelProps} />}
          </>
        )}
      </main>
    </div>
  );
}
