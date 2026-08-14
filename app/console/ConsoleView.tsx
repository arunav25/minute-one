"use client";

import { useEffect, useState } from "react";
import { api, useProductReport, useProducts } from "./console-data";
import {
  InstallPanel,
  JourneyPanel,
  SearchPanel,
  KnowledgePanel,
  OverviewPanel,
  SessionsPanel,
  SettingsPanel,
  SetupPanel,
  UsersPanel,
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

/**
 * Who is signed in to the console.
 *
 * Display only. Minute One has no authentication yet — see DISCLOSURE.md — so
 * this is configuration, not a session, and it says so rather than implying a
 * login that does not exist.
 */
const CONSOLE_USER = {
  name: process.env.NEXT_PUBLIC_CONSOLE_USER_NAME || "Arunav Malhotra",
  email: process.env.NEXT_PUBLIC_CONSOLE_USER_EMAIL || "arunav@saaslabs.co",
};

const SECTIONS = [
  {
    group: "Product",
    items: [
      { id: "overview", label: "Overview" },
      { id: "setup", label: "Setup" },
    ],
  },
  {
    group: "Knowledge",
    items: [
      { id: "knowledge", label: "Data sources" },
      { id: "search", label: "Search" },
      { id: "journey", label: "Journey" },
    ],
  },
  {
    group: "Install",
    items: [
      { id: "install", label: "Install snippet" },
      { id: "settings", label: "Settings" },
    ],
  },
  {
    group: "Monitor",
    items: [
      { id: "sessions", label: "Sessions" },
      { id: "users", label: "Users" },
    ],
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
  const { report, eventCount, identities, events } = useProductReport(
    selected?.key ?? null
  );

  /*
   * Theme.
   *
   * Dark is the default because this is a tool people sit in for a while, and
   * because the one place brand colour appears is the mark. The choice is kept
   * in localStorage rather than following the OS: an operator who has picked
   * light on a bright desk should not be flipped back at sunset by the system.
   */
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const saved = window.localStorage.getItem("minute-one-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  /*
   * Written on the click, not in an effect on `theme`.
   *
   * An effect keyed on the value also fires on mount, with the default — so the
   * first render wrote "dark" over a saved "light" before the restoring effect
   * could be read back, and the preference silently reset on every reload.
   */
  const chooseTheme = (next: "dark" | "light") => {
    setTheme(next);
    window.localStorage.setItem("minute-one-theme", next);
  };

  const [section, setSection] = useState("overview");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const panelProps = selected
    ? { product: selected, report, eventCount, identities, events, busy, run }
    : null;

  return (
    <div className="cn" data-theme={theme}>
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
          <button
            className="cn-theme"
            data-testid="theme-toggle"
            onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
            {theme === "dark" ? "Dark" : "Light"}
          </button>
          <a href="/embed-test">Demo product</a>
          <a href="/report">Full report</a>
          <div className="cn-account">
            <span className="cn-avatar" aria-hidden="true">
              {CONSOLE_USER.name.charAt(0)}
            </span>
            <div>
              <strong>{CONSOLE_USER.name}</strong>
              <span className="cn-muted">{CONSOLE_USER.email}</span>
            </div>
          </div>
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
            {section === "search" && <SearchPanel {...panelProps} />}
            {section === "sessions" && <SessionsPanel {...panelProps} />}
            {section === "users" && <UsersPanel {...panelProps} />}
          </>
        )}
      </main>
    </div>
  );
}
