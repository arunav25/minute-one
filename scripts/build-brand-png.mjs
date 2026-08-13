import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Rasterises public/brand/*.svg into public/brand/png/*.png.
 *
 * Chromium rather than a standalone SVG rasteriser: the lockups set type in the
 * system UI font, and only a real browser resolves that stack the same way the
 * shipped SVG will resolve it in a page. Backgrounds stay transparent.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public/brand");
const out = join(src, "png");

/** width/height are the SVG's own viewBox aspect; `sizes` are output widths. */
const JOBS = [
  { file: "logo-mark.svg", ratio: 1, sizes: [64, 128, 256, 512, 1024] },
  { file: "logo-mark-dark.svg", ratio: 1, sizes: [256, 512, 1024] },
  { file: "logo-mark-mono.svg", ratio: 1, sizes: [256, 512] },
  { file: "logo-lockup.svg", ratio: 231 / 64, sizes: [480, 960, 1920] },
  { file: "logo-lockup-dark.svg", ratio: 231 / 64, sizes: [480, 960, 1920] },
  { file: "logo-lockup-caps.svg", ratio: 246 / 64, sizes: [480, 960] },
  { file: "logo-lockup-stacked.svg", ratio: 246 / 64, sizes: [480, 960] },
  { file: "icon.svg", ratio: 1, sizes: [128, 256, 512, 1024] },
  { file: "favicon.svg", ratio: 1, sizes: [16, 32, 48, 64, 180, 512] },
];

await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
let written = 0;

for (const job of JOBS) {
  const svg = await readFile(join(src, job.file), "utf8");
  const stem = job.file.replace(/\.svg$/, "");

  for (const w of job.sizes) {
    const h = Math.round(w / job.ratio);
    await page.setViewportSize({ width: w, height: h });
    // The SVG is inlined rather than linked so no network fetch can race the shot.
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}
       svg{display:block;width:${w}px;height:${h}px}</style>${svg}`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.screenshot({ omitBackground: true });
    const name = `${stem}-${w}.png`;
    await writeFile(join(out, name), buf);
    written += 1;
    console.log(`  ${name.padEnd(30)} ${w}×${h}`);
  }
}

// One contact sheet of the whole system, straight from the brand page. Loaded
// over file:// so this works without the dev server running.
await page.setViewportSize({ width: 900, height: 1200 });
// Reduced motion so the animated mark is captured in its finished state rather
// than at frame zero, where it is still undrawn.
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto(`file://${join(src, "index.html")}`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(out, "brand-sheet.png"), fullPage: true });
written += 1;
console.log(`  ${"brand-sheet.png".padEnd(30)} contact sheet`);

await browser.close();
console.log(`\nwrote ${written} png files to public/brand/png`);
