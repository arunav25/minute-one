import { describe, expect, it } from "vitest";
import { clampText, redactText, sanitise } from "./redaction";

/**
 * Redaction runs before any page text reaches a model or the event log, so a
 * gap here is a live data leak rather than a cosmetic bug.
 */
describe("redaction", () => {
  it("removes phone numbers in several formats", () => {
    expect(redactText("Call +1 415 555 0142 now")).not.toContain("415");
    expect(redactText("Number: (415) 555-0142")).toContain("[redacted-number]");
    expect(redactText("+44 20 7946 0913")).toContain("[redacted-number]");
  });

  it("removes email addresses", () => {
    expect(redactText("owner is arunav@saaslabs.co")).toBe(
      "owner is [redacted-email]"
    );
  });

  it("removes api keys and tokens", () => {
    expect(redactText("key sk_live_abcd1234efgh")).toContain("[redacted-key]");
    expect(redactText("Bearer_aaaabbbbccccdddd")).toContain("[redacted-key]");
  });

  it("removes card-length digit runs", () => {
    const out = redactText("4111 1111 1111 1111");
    expect(out).not.toContain("4111 1111 1111 1111");
  });

  it("leaves ordinary product text alone", () => {
    const text = "Assign to team — Sales or Support";
    expect(redactText(text)).toBe(text);
  });

  it("clamps long text and collapses whitespace", () => {
    expect(clampText("a\n\n   b", 10)).toBe("a b");
    expect(clampText("x".repeat(50), 10)).toHaveLength(10);
  });

  it("sanitise redacts and clamps together", () => {
    const out = sanitise(`contact me at a@b.co ${"z".repeat(300)}`, 40);
    expect(out).not.toContain("a@b.co");
    expect(out.length).toBeLessThanOrEqual(40);
  });
});
