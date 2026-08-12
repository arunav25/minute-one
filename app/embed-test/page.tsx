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
  return <EmbedTest />;
}
