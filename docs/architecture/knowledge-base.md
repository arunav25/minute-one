# The knowledge base

How the guide answers a question it was never scripted for — and why the answer
comes from retrieval rather than from the prompt.

## The shape

```
help-centre archive (markdown + HTML)
        │  scripts/ingest-knowledge.mjs
        ▼
   parse frontmatter · strip HTML · decode entities
        │
   chunk ~1100 chars, 150 overlap, broken on paragraph/sentence
        │
   embed in batches (text-embedding-3-small → 1536 dims)
        ▼
   NeonDB  knowledge_chunks(product_key, article_id, title, url, text, embedding vector(1536))
        │                                                    + HNSW cosine index
        │
   ── at answer time ──────────────────────────────────────────────
        │
   agent calls search_knowledge("how do I add a number?")
        ▼
   /api/minute-one/knowledge/search  →  embed the question
        ▼
   ORDER BY embedding <=> query   (cosine distance, scoped to product_key)
        ▼
   de-duplicate by article, return top-k passages
        ▼
   the model answers **only** from those passages
```

## Why retrieval, not prompt-stuffing

The first version pasted every note into the persona and truncated at 6 000
characters. That works for a handful of hand-written notes and fails for a help
centre: 1 185 JustCall articles are roughly a million tokens. Retrieval keeps
the prompt small, the cost per turn flat, and the corpus unbounded.

It also makes the grounding inspectable. The console's **Search** panel calls
the same endpoint the agent's tool calls, so what you see there is exactly what
the guide would answer from — not a preview built from a second code path that
can drift.

## Ingest

```bash
node scripts/ingest-knowledge.mjs <archive-dir> <productKey> [--include=file] [--match=regex]
```

- `--include=file` — a list of article ids, one per line, `#` comments allowed.
  Curation matters: for a demo you usually want a dozen on-topic articles, not
  the whole centre.
- `--match=regex` — keep articles whose title matches.

The script loads `.env.local` itself (a bare `node` process does not read it the
way Next.js does), creates the table and indexes if absent, and **replaces** that
product's imported rows so a re-run cannot leave stale chunks behind.

Notes written in the console are left alone by a re-ingest. They carry a `kb_`
article id, and wiping somebody's hand-written answers because an archive was
re-imported is not something a re-run should ever do silently.

Cost: ~1 185 articles ≈ 1M tokens ≈ **$0.02** on `text-embedding-3-small`.

## Training from the console

*Data sources* accepts text snippets, Q&A pairs and files. They live on the
product record until **Retrain agent** embeds them into the same index the
imported articles use, through `/api/minute-one/knowledge/train`. Sources show
`Trained` or `Untrained` so it is always clear whether what you typed is
actually reachable by the agent.

## The failure mode to understand

**Semantic search always returns its nearest neighbours, however far away they
are.** A gap in the corpus does not surface as "I don't know" — it surfaces as a
confident answer assembled from whatever was closest.

This bit us concretely. Asked *"how do I set up automated calling?"* with no
campaign article in the corpus, search returned **"Setup a Team Phone number"**,
and the guide invented a flow through the Teams section.

The instinct is a similarity threshold. The numbers killed it:

| Query | Top hit | Score |
| --- | --- | --- |
| set up outbound campaign *(no such article)* | Setup a Team Phone number | **0.444** |
| how do I buy a phone number *(correct answer exists)* | Getting a New Phone Number | **0.518** |

The misleading hit scored in the same band as a correct one. No threshold
separates them. **The fix for a gap in the corpus is to close the gap** — so the
Sales Dialer articles were added, and the right one now leads at 0.572.

Use the console's Search panel to find these before a customer does.

## Precedence: journey over article

While a journey step is open, the **authored step wins** over anything
retrieved. Help articles describe every route a product supports; a journey is
the one route the product's team chose and proved.

Without that rule, asking to send a message retrieved *"How to send bulk SMS"*,
and the guide sent the user to the Messaging section — where the step's proof
does not exist, so it could never pass. The persona now states the precedence
explicitly, and leaves `search_knowledge` for questions that are not about the
current step (a price, a term), answered briefly before repeating the step.

## Operational notes

- The **embedding model must match** between ingest and query. Vectors from two
  models are not comparable and cosine search returns nonsense. Both read the
  same `EMBEDDING_MODEL` variable for exactly this reason.
- Search is scoped to `product_key`, so one product's key cannot read another's
  corpus.
- Results are de-duplicated by article, so one long page cannot fill every slot.
- HNSW index creation is best-effort; search still works on an older pgvector via
  sequential scan.
- The embedding key never reaches the browser. The agent's tool call goes to the
  Minute One server, which does the embedding.
