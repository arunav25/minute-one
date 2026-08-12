"use client";

import { useEffect, useRef } from "react";
import { MinuteOne } from "@minute-one/web";
import {
  PyAIVoiceAdapter,
  createPlayback,
  startMicrophone,
} from "@minute-one/voice-pyai";
import { MockVoiceAdapter } from "@minute-one/voice-mock";
import { acmeBookingFlow } from "./acme-flow";

/**
 * Mounts the guide alongside the demo product.
 *
 * This is the whole integration when a host controls its own source: construct,
 * choose adapters, init. The guide mounts its own Shadow DOM overlay; the
 * product renders none of it and cannot advance a step.
 *
 * `?voice=mock` runs the journey without PyAI, for the browser tests, which
 * cannot speak and have no key. It is an explicit opt-in in the URL, never a
 * silent fallback — the adapter still reports itself as the mock, so the
 * overlay and report both say `isRealVoice: false`.
 */
export function GuideMount() {
  const ref = useRef<MinuteOne | null>(null);

  useEffect(() => {
    const mockVoice =
      new URLSearchParams(window.location.search).get("voice") === "mock";

    const guide = new MinuteOne({
      flow: acmeBookingFlow,
      createVoiceAdapter: () =>
        mockVoice
          ? new MockVoiceAdapter("explicitly requested with ?voice=mock")
          : new PyAIVoiceAdapter({
              tokenEndpoint: "/api/minute-one/session",
              startMicrophone,
              createPlayback,
            }),
      createDemoAdapter: (reason) => new MockVoiceAdapter(reason),
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
  }, []);

  return null;
}
