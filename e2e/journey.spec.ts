import { expect, test, type Page } from "@playwright/test";

/**
 * The claim this project makes is that a step cannot advance without proof.
 * Unit tests check that against a scripted page; these check it against a real
 * browser, a real DOM, and the real overlay, running on the demo product at
 * /embed-test.
 *
 * Voice runs on the mock here, requested explicitly with `?voice=mock`: the
 * suite has no microphone and cannot speak. Everything under test — the
 * verification gate, the recovery wording, the spotlight — is provider
 * independent, and the overlay still reports the mock as a mock.
 */

type Status = {
  running: boolean;
  stepId: string | null;
  stepIndex: number;
  attempt: number;
  state: string;
  terminal: string | null;
  missing: string[];
};

const status = (page: Page) =>
  page.evaluate(() => {
    const sdk = (window as unknown as { __minuteOne?: { getStatus(): Status } })
      .__minuteOne;
    return sdk ? sdk.getStatus() : null;
  }) as Promise<Status | null>;

/** The overlay lives in an open shadow root, which Playwright pierces. */
const instruction = (page: Page) => page.getByTestId("instruction");

async function startGuide(page: Page) {
  await page.goto("/embed-test?voice=mock");
  await page.getByRole("button", { name: "Start voice guide" }).click();
  // The mock does not listen, so the goal is chosen through the overlay.
  await page.getByRole("button", { name: "Use supported goal" }).click();
  await expect.poll(async () => (await status(page))?.running).toBe(true);
}

/** Walk the product up to the team-assignment step, which is the one that matters. */
async function reachTeamStep(page: Page) {
  await startGuide(page);
  await page.getByTestId("new-booking").click();
  await expect
    .poll(async () => (await status(page))?.stepId, { timeout: 20_000 })
    .toBe("assign-team");
}

test.describe("verified journey", () => {
  test("a wrong action does not advance the step", async ({ page }) => {
    await reachTeamStep(page);

    await page.getByTestId("team-support").click();

    // Give the guide longer than it needs, so this cannot pass by being quick.
    await page.waitForTimeout(3000);

    const s = await status(page);
    expect(s?.stepId).toBe("assign-team");
    expect(s?.terminal).toBeNull();
    await expect(page.getByTestId("missing-evidence")).toBeVisible();
  });

  test("the correct action advances, and the journey completes", async ({ page }) => {
    await reachTeamStep(page);

    await page.getByTestId("team-support").click();
    await page.waitForTimeout(1500);
    await page.getByTestId("team-sales").click();

    await expect
      .poll(async () => (await status(page))?.stepId, { timeout: 25_000 })
      .toBe("confirm-booking");

    await page.getByTestId("confirm-booking").click();

    await expect
      .poll(async () => (await status(page))?.terminal, { timeout: 25_000 })
      .toBe("completed");
    await expect(page.getByTestId("terminal")).toBeVisible();
  });

  test("the recovery wording changes between attempts", async ({ page }) => {
    await reachTeamStep(page);

    const first = await instruction(page).innerText();

    // Do the wrong thing; the failure must be phrased differently.
    await page.getByTestId("team-support").click();
    await expect
      .poll(async () => (await status(page))?.attempt, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const second = await instruction(page).innerText();

    expect(second).not.toBe(first);
  });

  test("the spotlight follows the current target", async ({ page }) => {
    await reachTeamStep(page);

    // The ring is decoration inside the overlay's shadow root: it must track
    // the target's box without ever intercepting a click.
    const ring = await page.evaluate(() => {
      const host = document.querySelector("minute-one-overlay");
      const el = host?.shadowRoot?.querySelector(".ring") as HTMLElement | null;
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return {
        pointerEvents: getComputedStyle(el).pointerEvents,
        ariaHidden: el.getAttribute("aria-hidden"),
        width: box.width,
        height: box.height,
        top: box.top,
        left: box.left,
      };
    });

    expect(ring).not.toBeNull();
    expect(ring!.pointerEvents).toBe("none");
    expect(ring!.ariaHidden).toBe("true");
    expect(ring!.width).toBeGreaterThan(0);

    const target = await page.getByTestId("team-sales").boundingBox();
    expect(target).not.toBeNull();
    // Same place as the control it is pointing at, within a few pixels.
    expect(Math.abs(ring!.left - target!.x)).toBeLessThan(12);
    expect(Math.abs(ring!.top - target!.y)).toBeLessThan(12);
  });

  test("the host page cannot advance the guide by itself", async ({ page }) => {
    await startGuide(page);
    const before = await status(page);

    // Reporting host evidence is allowed; deciding the step passed is not.
    await page.evaluate(() => {
      (window as unknown as {
        __minuteOne?: { track(name: string): void };
      }).__minuteOne?.track("booking.created");
    });
    await page.waitForTimeout(1500);

    const after = await status(page);
    expect(after?.stepId).toBe(before?.stepId);
    expect(after?.terminal).toBeNull();
  });
});
