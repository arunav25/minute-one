import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const request = (origin = "http://localhost:3200") =>
  new Request("http://localhost:3200/api/minute-one/session", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Deepgram session token route", () => {
  it("keeps the API key server-side and returns only a temporary token", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "server-secret");
    const grant = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: "Token server-secret",
        "content-type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({ ttl_seconds: 60 });
      return new Response(
        JSON.stringify({ access_token: "short-lived-token", expires_in: 60 }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", grant);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      token: "short-lived-token",
      expiresIn: 60,
      models: {
        listen: "flux-general-en",
        think: "gpt-4o-mini",
        speak: "aura-2-thalia-en",
      },
    });
    expect(JSON.stringify(body)).not.toContain("server-secret");
    expect(grant).toHaveBeenCalledOnce();
  });

  it("refuses to operate without a server-side API key", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    const grant = vi.fn();
    vi.stubGlobal("fetch", grant);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("missing_api_key");
    expect(grant).not.toHaveBeenCalled();
  });

  it("applies the extra origin spend gate before requesting a token", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "server-secret");
    vi.stubEnv("DEEPGRAM_ALLOWED_ORIGINS", "https://allowed.example");
    const grant = vi.fn();
    vi.stubGlobal("fetch", grant);

    const response = await POST(request("http://localhost:3200"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("origin_not_allowed");
    expect(grant).not.toHaveBeenCalled();
  });
});
