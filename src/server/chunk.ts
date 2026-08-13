/**
 * Shared chunker for knowledge text.
 *
 * The same shape the ingest script uses: ~1100-char pieces with 150 overlap,
 * broken on paragraph or sentence boundaries so a chunk reads as prose, not a
 * mid-word cut. Console-added notes go through this before embedding so they
 * live in the same index, with the same retrieval behaviour, as imported
 * help-center articles.
 */

const CHUNK = 1100;
const OVERLAP = 150;

export function chunkText(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= CHUNK) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + CHUNK, clean.length);
    if (end < clean.length) {
      const window = clean.slice(i, end);
      const brk = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "));
      if (brk > CHUNK * 0.5) end = i + brk + 1;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    i = end - OVERLAP;
  }
  return chunks;
}
