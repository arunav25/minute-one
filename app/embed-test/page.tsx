import { EmbedTest } from "./EmbedTest";

export const dynamic = "force-dynamic";

/**
 * A deliberately plain third-party page.
 *
 * It is NOT a product we are building — it exists to prove the script works on
 * a page that knows nothing about Minute One beyond one tag. Nothing here
 * imports the SDK; the tag does all of it.
 */
export default function EmbedTestPage() {
  /*
   * Which providers this server can actually mint for, in preference order —
   * the same order `compileProduct` reports to the embedded script.
   *
   * Resolved on the server because only the server can see the keys. A clone
   * with none gets an empty list, and the page runs the scripted adapter
   * instead of failing at the first click: someone who has just cloned the
   * repository should reach a working journey without going to fetch a key.
   * The mock still reports itself as the mock, so nothing claims to be real
   * voice that is not.
   */
  const voiceProviders = (
    [
      ["pyai", process.env.PYAI_API_KEY],
      ["deepgram", process.env.DEEPGRAM_API_KEY],
    ] as const
  )
    .filter(([, key]) => Boolean(key))
    .map(([name]) => name);

  return <EmbedTest voiceProviders={voiceProviders} />;
}
