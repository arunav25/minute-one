import { NextResponse } from "next/server";
import {
  addKnowledge,
  createProduct,
  deleteProduct,
  listProducts,
  removeKnowledge,
  updateProduct,
} from "../../../../src/server/product-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Console API for managing products and their knowledge bases.
 *
 * Deliberately unauthenticated for the beta and bound to local use — see
 * DISCLOSURE.md. This is the one endpoint that must not be exposed publicly.
 */
export async function GET() {
  return NextResponse.json({ products: listProducts() });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "malformed json" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  switch (action) {
    case "create": {
      const name = String(body.name ?? "").trim();
      if (!name) {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
      }
      return NextResponse.json({ product: createProduct(name) });
    }

    case "add-knowledge": {
      const product = addKnowledge(
        String(body.productId ?? ""),
        String(body.title ?? ""),
        String(body.body ?? "")
      );
      if (!product) {
        return NextResponse.json({ error: "unknown product" }, { status: 404 });
      }
      return NextResponse.json({ product });
    }

    case "remove-knowledge": {
      const product = removeKnowledge(
        String(body.productId ?? ""),
        String(body.entryId ?? "")
      );
      if (!product) {
        return NextResponse.json({ error: "unknown product" }, { status: 404 });
      }
      return NextResponse.json({ product });
    }

    case "update": {
      const product = updateProduct(String(body.productId ?? ""), {
        name: body.name === undefined ? undefined : String(body.name),
        goal: body.goal === undefined ? undefined : String(body.goal),
        goalPhrases: Array.isArray(body.goalPhrases)
          ? body.goalPhrases.map(String)
          : undefined,
        steps: Array.isArray(body.steps)
          ? (body.steps as Parameters<typeof updateProduct>[1]["steps"])
          : undefined,
        allowedOrigins: Array.isArray(body.allowedOrigins)
          ? body.allowedOrigins.map(String)
          : undefined,
      } as Parameters<typeof updateProduct>[1]);
      if (!product) {
        return NextResponse.json({ error: "unknown product" }, { status: 404 });
      }
      return NextResponse.json({ product });
    }

    case "delete": {
      const ok = deleteProduct(String(body.productId ?? ""));
      return NextResponse.json({ ok });
    }

    default:
      return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
  }
}
