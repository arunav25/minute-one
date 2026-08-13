"use client";

import { AcmeApp } from "./AcmeApp";
import { GuideMount } from "./GuideMount";

/**
 * The local demo surface.
 *
 * A generic beta product (Acme Scheduling) with the guide mounted beside it, so
 * the verification gate can be shown end to end with no external setup. It is a
 * different product from JustCall on purpose: the engine is generic, and the
 * real JustCall integration runs on the actual app at app.justcall.local, not a
 * localhost lookalike.
 *
 * Add `?voice=mock` to run without Deepgram (used by the browser tests).
 */
export function EmbedTest() {
  return (
    <>
      <AcmeApp />
      <GuideMount />
    </>
  );
}
