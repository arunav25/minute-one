"use client";

import { useEffect, useRef } from "react";
import { MinuteOne } from "@minute-one/web";
import { MockVoiceAdapter } from "@minute-one/voice-mock";
import { acmeBookingFlow } from "./acme-flow";

/**
 * Mounts the guide alongside the demo product.
 *
 * This is the whole integration when a host controls its own source: construct,
 * choose adapters, init. The guide mounts its own Shadow DOM overlay; the
 * product renders none of it and cannot advance a step.
 *
 * Voice is chosen the same way the embedded script chooses it: the server says
 * which providers it holds a key for, in preference order, and the first socket
 * that opens wins. Two things fall back to the scripted adapter — `?voice=mock`,
 * and a server with no key at all. Neither is a silent substitution: the mock
 * reports itself as the mock, so the overlay and the report both say
 * `isRealVoice: false`.
 */
export function GuideMount({ voiceProviders }: { voiceProviders: string[] }) {
  const ref = useRef<MinuteOne | null>(null);

  useEffect(() => {
    const forced =
      new URLSearchParams(window.location.search).get("voice") === "mock";
    /*
     * A fresh clone has no keys. Failing at the first click would be correct
     * and useless: there is nothing the visitor can do about it on that page,
     * and the journey, the verifier and the overlay all work without a vendor.
     * So run them, and say plainly that the voice is scripted.
     */
    const scripted = forced || voiceProviders.length === 0;
    const reason = forced
      ? "explicitly requested with ?voice=mock"
      : "no voice provider key is configured on this server";

    // Built only when its turn comes, so an unused vendor is never loaded.
    const factories = voiceProviders.map((provider) => async () => {
      if (provider === "pyai") {
        const { PyAIVoiceAdapter } = await import("@minute-one/voice-pyai");
        return new PyAIVoiceAdapter({
          tokenEndpoint: "/api/minute-one/session?provider=pyai",
        });
      }
      const { DeepgramVoiceAdapter } = await import(
        "@minute-one/voice-deepgram"
      );
      return new DeepgramVoiceAdapter({
        tokenEndpoint: "/api/minute-one/session?provider=deepgram",
      });
    });

    const guide = new MinuteOne({
      flow: acmeBookingFlow,
      ...(scripted
        ? { createVoiceAdapter: () => new MockVoiceAdapter(reason) }
        : { createVoiceAdapterFor: factories, voiceProviders }),
      createDemoAdapter: (r) => new MockVoiceAdapter(r),
      eventsEndpoint: "/api/minute-one/events",
      reportUrl: "/report",
      helpNumber: process.env.NEXT_PUBLIC_HELP_NUMBER ?? "+1 415 555 0100",
    });

    guide.init();
    ref.current = guide;
    // Exposed so the e2e suite can assert on real SDK state rather than pixels.
    (window as unknown as { __minuteOne?: MinuteOne }).__minuteOne = guide;

    return () => {
      void guide.destroy();
      ref.current = null;
    };
  }, [voiceProviders]);

  return null;
}
