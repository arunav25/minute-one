import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

// 1. The widget, mid-journey, on a host page.
await p.goto("https://localhost:3200/host-test.html", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.evaluate(() => {
  const i = window.MinuteOne.instance;
  const r = document.querySelector("minute-one-overlay").shadowRoot;
  r.querySelector(".orb")?.click();
  i.patch({
    running: true, stage: "Listening",
    instruction: "Now choose Add Number, top right.", targetLabel: "Add Number",
    proof: { provider: "deepgram", model: "m", sessionId: "s", connection: "connected", minutes: 0.4, disconnectReason: null, fallbackReason: null, isRealVoice: true },
    transcript: [
      { role: "user", text: "help me add a phone number" },
      { role: "assistant", text: "Choose Add a number to open your phone numbers." },
    ],
  });
  const t = [...r.querySelectorAll("button")].find((b) => b.dataset.action === "transcript");
  t && t.click();
});
await p.waitForTimeout(900);
await p.screenshot({ path: "docs/images/widget.png" });

// 2. The console — dark, JustCall selected, Sessions open.
await p.goto("https://localhost:3200/console", { waitUntil: "networkidle" });
await p.waitForTimeout(3500);
const sel = p.locator("[data-testid=product-select]");
if (await sel.count()) { await sel.selectOption({ label: "JustCall" }); await p.waitForTimeout(2500); }
await p.screenshot({ path: "docs/images/console.png" });

// 3. The retrieval inspector — the screen that proves grounding.
const search = p.locator("[data-testid=nav-search]");
if (await search.count()) {
  await search.click();
  await p.waitForTimeout(1200);
  // Run a real query — an empty inspector proves nothing. This is the screen
  // that shows what the agent would actually answer from, with scores.
  await p.fill("[data-testid=search-q]", "how do I add a phone number");
  await p.keyboard.press("Enter");
  await p.waitForSelector("[data-testid=search-hits] li", { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(800);
}
await p.screenshot({ path: "docs/images/search.png" });

await b.close();
console.log("captured");
