"use client";

import { useCallback, useEffect, useState } from "react";
import { buildReport, type ReportData, type SessionEvent } from "@minute-one/core";

/**
 * Data layer for the console.
 *
 * Everything here talks to the same two endpoints the embedded script uses, so
 * what the console shows is what a host page would actually be served — no
 * separate read model that can drift from it.
 */

export type KnowledgeEntry = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
  kind?: "text" | "qa" | "file";
};

/** One row in the Data sources list — a note or an imported article. */
export type DataSource = {
  id: string;
  kind: "text" | "qa" | "file" | "article";
  title: string;
  url?: string;
  bytes: number;
  updatedAt: string | null;
  trained: boolean;
  trainedAt: string | null;
  chunks: number;
};

export type SourcesData = {
  sources: DataSource[];
  lastTrainedAt: string | null;
  totalBytes: number;
  canTrain: boolean;
};

export type JourneyStep = {
  id: string;
  objective: string;
  instruction: string;
  targetName?: string;
  successText?: string;
  successRoute?: string;
};

export type Product = {
  id: string;
  key: string;
  name: string;
  allowedOrigins: string[];
  knowledge: KnowledgeEntry[];
  goal: string;
  goalPhrases: string[];
  steps: JourneyStep[];
  createdAt: string;
};

export async function api(body: Record<string, unknown>) {
  const res = await fetch("/api/minute-one/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
  return data;
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/minute-one/products", { cache: "no-store" });
      const data = (await res.json()) as { products: Product[] };
      setProducts(data.products ?? []);
      setSelectedId((current) => current ?? data.products?.[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Wraps a mutation so every path reports its own failure and re-reads. */
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  return {
    products,
    selected: products.find((p) => p.id === selectedId) ?? null,
    selectedId,
    setSelectedId,
    error,
    setError,
    busy,
    loaded,
    refresh,
    run,
  };
}

/**
 * The Data sources panel's view: console notes merged with what the semantic
 * index actually holds, plus when it was last trained.
 */
export function useSources(productId: string | null) {
  const [data, setData] = useState<SourcesData | null>(null);

  const reload = useCallback(async () => {
    if (!productId) {
      setData(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/minute-one/knowledge/sources?productId=${encodeURIComponent(productId)}`,
        { cache: "no-store" }
      );
      if (res.ok) setData((await res.json()) as SourcesData);
    } catch {
      // Leave the previous view; the panel states when it is empty.
    }
  }, [productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, reload };
}

export async function trainAgent(productId: string) {
  const res = await fetch("/api/minute-one/knowledge/train", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ productId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `training failed (${res.status})`);
  return data as { trainedNotes: number; totalChunks: number; trainedAt: string };
}

/** Whatever the host application told us about who was in a session. */
export type SessionIdentity = {
  userId?: string;
  email?: string;
  name?: string;
  companyName?: string;
  locale?: string;
  meta?: Record<string, string>;
};

/**
 * This product's own session activity.
 *
 * Scoped by product key rather than reading the whole log: an unattributed
 * total tells you nothing about the product you are looking at.
 */
export function useProductReport(productKey: string | null) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [identities, setIdentities] = useState<Record<string, SessionIdentity>>({});

  const load = useCallback(async () => {
    if (!productKey) {
      setReport(null);
      setEventCount(0);
      setIdentities({});
      return;
    }
    try {
      const res = await fetch(
        `/api/minute-one/events?key=${encodeURIComponent(productKey)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        events: SessionEvent[];
        identities?: Record<string, SessionIdentity>;
      };
      setEventCount(data.events.length);
      setIdentities(data.identities ?? {});
      setReport(buildReport(data.events));
    } catch {
      // Leave the previous view in place; the panel states when it is empty.
    }
  }, [productKey]);

  useEffect(() => {
    void load();
    // Sessions arrive while the console is open, so poll rather than making the
    // user reload to find out whether their install works.
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  return { report, eventCount, identities, reload: load };
}

/** Which setup steps are done, derived from the product itself. */
export function setupState(product: Product | null, hasSessions: boolean) {
  return [
    {
      id: "product",
      title: "Create your product",
      done: Boolean(product),
      detail: product
        ? `${product.name} — created ${new Date(product.createdAt).toLocaleDateString()}`
        : "Name the app you want guided.",
    },
    {
      id: "knowledge",
      title: "Add knowledge",
      done: Boolean(product && product.knowledge.length > 0),
      detail: product?.knowledge.length
        ? `${product.knowledge.length} note${product.knowledge.length === 1 ? "" : "s"} the guide may answer from`
        : "Without this the guide has nothing to answer from.",
    },
    {
      id: "journey",
      title: "Author a journey",
      done: Boolean(product && product.steps.length > 0),
      detail: product?.steps.length
        ? product.steps.length === 1
          ? "1 step with a success condition"
          : `${product.steps.length} steps, each with a success condition`
        : "Optional. Without one the guide answers questions but cannot verify anything.",
    },
    {
      id: "install",
      title: "Install the snippet",
      done: hasSessions,
      detail: hasSessions
        ? "Confirmed — this product has reported sessions."
        : "Not confirmed yet. This ticks itself when the embed reports its first session.",
    },
  ];
}
