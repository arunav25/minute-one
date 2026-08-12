"use client";

import { useEffect, useRef } from "react";
import { MinuteOne } from "@minute-one/web";
import { setupSalesNumberFlow } from "@minute-one/app-justcall";
import { PyAIVoiceAdapter, createPlayback, startMicrophone } from "@minute-one/voice-pyai";
import { MockVoiceAdapter } from "@minute-one/voice-mock";

/**
 * How a host application embeds the SDK when it controls its own source.
 *
 * This is the entire integration: construct, choose adapters, init. The guide
 * mounts its own Shadow DOM overlay; the host does not render any of it, and
 * the host cannot advance a step.
 */
export function GuideMount() {
  const ref = useRef<MinuteOne | null>(null);

  useEffect(() => {
    const guide = new MinuteOne({
      flow: setupSalesNumberFlow,
      createVoiceAdapter: () =>
        new PyAIVoiceAdapter({
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
