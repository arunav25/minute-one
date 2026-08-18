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
 * `?voice=mock` forces the scripted adapter. A server with no provider key
 * selects it anyway — see `GuideMount`.
 */
export function EmbedTest({ voiceProviders }: { voiceProviders: string[] }) {
  return (
    <>
      <AcmeApp />
      <GuideMount voiceProviders={voiceProviders} />
    </>
  );
}
