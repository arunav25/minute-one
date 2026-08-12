import { build } from "esbuild";

/**
 * Builds the script-tag bundle into public/minute-one.js.
 *
 * Local file only — there is no CDN and no versioned distribution channel,
 * which is deliberate for a hackathon build.
 */
await build({
  entryPoints: ["packages/web/src/browser-entry.ts"],
  outfile: "public/minute-one.js",
  bundle: true,
  format: "iife",
  globalName: "MinuteOneBundle",
  platform: "browser",
  target: ["es2020"],
  sourcemap: true,
  minify: false,
  logLevel: "info",
});

console.log("built public/minute-one.js");
