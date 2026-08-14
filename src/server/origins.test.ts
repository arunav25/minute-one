import { expect, test } from "vitest";
import { originAllowed, originMatches, parseOrigins } from "./origins";

const WILD = "https://*.trycloudflare.com";

test("exact origins still match, and only themselves", () => {
  expect(originMatches("https://a.example.com", "https://a.example.com")).toBe(true);
  expect(originMatches("https://b.example.com", "https://a.example.com")).toBe(false);
});

test("a wildcard admits subdomains over the same scheme", () => {
  expect(originMatches("https://formatting-noted-bids-picnic.trycloudflare.com", WILD)).toBe(true);
  expect(originMatches("https://a.b.trycloudflare.com", WILD)).toBe(true);
});

/**
 * The reason this is parsed rather than string-matched. Each of these passes a
 * naive `endsWith(".trycloudflare.com")` or `includes(...)` check, and each one
 * would hand an attacker the ability to mint voice credit against a product key
 * that is public by design.
 */
test("a wildcard rejects lookalike hosts", () => {
  expect(originMatches("https://trycloudflare.com.attacker.example", WILD)).toBe(false);
  expect(originMatches("https://evil.example/?x=.trycloudflare.com", WILD)).toBe(false);
  expect(originMatches("https://evil.example#.trycloudflare.com", WILD)).toBe(false);
  expect(originMatches("https://nottrycloudflare.com", WILD)).toBe(false);
});

test("a wildcard rejects the bare apex", () => {
  expect(originMatches("https://trycloudflare.com", WILD)).toBe(false);
});

test("the scheme is not wildcarded", () => {
  expect(originMatches("http://x.trycloudflare.com", WILD)).toBe(false);
});

test("a port is not smuggled past a wildcard", () => {
  expect(originMatches("https://x.trycloudflare.com:8443", WILD)).toBe(false);
});

test("an empty allowlist admits nothing", () => {
  expect(originAllowed("https://x.trycloudflare.com", [])).toBe(false);
});

test("parseOrigins trims and drops blanks", () => {
  expect(parseOrigins(" a , ,b ")).toEqual(["a", "b"]);
  expect(parseOrigins(undefined)).toEqual([]);
});
