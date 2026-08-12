"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Fixture state for the JustCall-style example app.
 *
 * This is the *example layer*: a stand-in product the guide can be pointed at
 * with zero external setup.
 *
 * Two details exist to keep the fixture honest as a test surface:
 *
 * 1. Screen changes push real history entries, so `location.pathname` moves the
 *    way it would in a real product and `route_matches` rules mean something.
 * 2. No team is preselected, so Confirm starts disabled. The wrong action in
 *    the demo is choosing *Support* — a mistake the product happily allows and
 *    the guide has to catch.
 */

export type FixtureScreen = "dashboard" | "phone-numbers" | "settings";

export const FIXTURE_ROUTES: Record<FixtureScreen, string> = {
  dashboard: "/fixture",
  "phone-numbers": "/fixture/phone-numbers",
  settings: "/fixture/settings",
};

export type FixtureState = {
  screen: FixtureScreen;
  dialogOpen: boolean;
  chosenNumber: string | null;
  team: "Sales" | "Support" | null;
  provisioned: { number: string; team: string } | null;
  notice: { kind: "success" | "error" | "info"; text: string } | null;
};

const INITIAL: FixtureState = {
  screen: "dashboard",
  dialogOpen: false,
  chosenNumber: null,
  team: null,
  provisioned: null,
  notice: null,
};

export const AVAILABLE_NUMBERS = [
  "+1 415 555 0142",
  "+1 415 555 0177",
  "+44 20 7946 0913",
];

type FixtureApi = FixtureState & {
  go: (screen: FixtureScreen) => void;
  openDialog: () => void;
  closeDialog: () => void;
  chooseNumber: (n: string) => void;
  setTeam: (t: "Sales" | "Support") => void;
  confirm: () => void;
  reset: () => void;
};

const Ctx = createContext<FixtureApi | null>(null);

function screenFromPath(path: string): FixtureScreen {
  if (path.startsWith("/fixture/phone-numbers")) return "phone-numbers";
  if (path.startsWith("/fixture/settings")) return "settings";
  return "dashboard";
}

export function FixtureProvider({ children }: { children: React.ReactNode }) {
  // Must match the server render exactly, so the screen is synced after mount
  // rather than read from location during the first render.
  const [state, setState] = useState<FixtureState>(INITIAL);

  useEffect(() => {
    const screen = screenFromPath(window.location.pathname);
    setState((s) => (s.screen === screen ? s : { ...s, screen }));
  }, []);

  const go = useCallback((screen: FixtureScreen) => {
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", FIXTURE_ROUTES[screen]);
    }
    // Navigating away closes the modal, as a real product would. Leaving it
    // open across routes also made the guide's target survive a route change,
    // which hid whether the spotlight recovers correctly.
    setState((s) => ({
      ...s,
      screen,
      notice: null,
      dialogOpen: false,
      chosenNumber: null,
      team: null,
    }));
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", FIXTURE_ROUTES.dashboard);
    }
    setState(INITIAL);
  }, []);

  const api = useMemo<FixtureApi>(
    () => ({
      ...state,
      go,
      reset,
      openDialog: () => setState((s) => ({ ...s, dialogOpen: true })),
      closeDialog: () =>
        setState((s) => ({
          ...s,
          dialogOpen: false,
          chosenNumber: null,
          team: null,
        })),
      chooseNumber: (chosenNumber) => setState((s) => ({ ...s, chosenNumber })),
      setTeam: (team) => setState((s) => ({ ...s, team })),
      confirm: () =>
        setState((s) => {
          if (!s.chosenNumber || !s.team) return s;
          return {
            ...s,
            dialogOpen: false,
            chosenNumber: null,
            provisioned: { number: s.chosenNumber, team: s.team },
            notice: { kind: "success", text: "Number is live" },
          };
        }),
    }),
    [state, go, reset]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFixture(): FixtureApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFixture must be used inside FixtureProvider");
  return ctx;
}

export { INITIAL as FIXTURE_INITIAL };
