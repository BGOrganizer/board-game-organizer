import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

/**
 * Match wizard E2E (Playwright, web).
 *
 * Requires the provisioned actor (E2E_EMAIL). Covers the full wizard:
 * step 1 name + date slots, step 2 player range + friend invite (the E2E
 * target is a friend only if the test users follow each other — the invite
 * picker requires >= 4 chars to search, so we assert the structure and the
 * required fields without depending on a specific friend), step 3 game
 * selection via the BGG picker, then submit.
 */
const E2E_EMAIL = process.env.E2E_EMAIL ?? "";

async function signInAsActor(page: import("@playwright/test").Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
}

test("match wizard: name → players → game → create", async ({ page }) => {
  test.setTimeout(240_000);
  test.skip(!E2E_EMAIL, "E2E_EMAIL not set (CI provisions the user)");

  await signInAsActor(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.session), null, {
    timeout: 60_000,
  });

  // Open the wizard via the FAB (bottom-right, aria-label).
  await page.getByLabel("Create a match").click();
  await expect(page.getByText("New match")).toBeVisible();

  // Step 1: name validation — short name keeps the next FAB disabled.
  const nameInput = page.getByPlaceholder("e.g. Friday night games");
  await nameInput.fill("abc");
  await expect(page.getByText("At least 5 characters")).toBeVisible();

  // Fill a valid name + one date slot (native datetime-local input).
  await nameInput.fill("Friday night games");
  const dateInput = page.locator('input[type="datetime-local"]').first();
  await dateInput.fill("2026-09-05T20:00");
  await expect(dateInput).toHaveValue("2026-09-05T20:00");

  // Adding a second date slot appends another empty input; removing the
  // only remaining slot is blocked (one stays). Every added slot must be
  // filled before the wizard lets you advance.
  await page.getByRole("button", { name: "Add another date" }).click();
  const dateInputs = page.locator('input[type="datetime-local"]');
  await expect(dateInputs).toHaveCount(2);
  const nextFab = page.locator('button[aria-label="Next step"]');
  await expect(nextFab).toBeDisabled(); // second date still empty
  await dateInputs.nth(1).fill("2026-09-06T21:00");
  await expect(dateInputs.nth(1)).toHaveValue("2026-09-06T21:00");

  // Advance: the next FAB is the bottom-right fixed button. Wait until it
  // becomes enabled (validation re-renders after the name+date fill).
  await expect(nextFab).toBeEnabled({ timeout: 10_000 });
  await nextFab.click();
  await expect(page.getByText("Players")).toBeVisible();

  // Step 2: player steppers — min cannot go below 1; max >= min enforced.
  await expect(page.getByText("Min")).toBeVisible();
  await expect(page.getByText("Max")).toBeVisible();
  await page.getByLabel("Increase min players").click();
  await page.getByLabel("Decrease min players").click();

  // Invite slots: count = max-1; each opens the friend picker page.
  await expect(page.getByText("Invite friends")).toBeVisible();
  await page
    .getByRole("button", { name: /Select a friend/ })
    .first()
    .click();
  await expect(page.getByPlaceholder(/Search users/)).toBeVisible();

  // Invite a friend when available. Planning matches may start without
  // invitations; minPlayers still stays at the API minimum of two.
  const addBtn = page.getByRole("button", { name: "Add" }).first();
  let friendPicked = false;
  try {
    await addBtn.waitFor({ state: "visible", timeout: 10_000 });
    await addBtn.click();
    friendPicked = true;
  } catch {
    // No friends available — the picker is empty.
  }
  if (!friendPicked) await page.getByLabel("Back").click();
  await expect(page.getByText("Players")).toBeVisible();

  // Advance to step 3; invitations are optional while planning.
  await nextFab.click();
  await expect(page.getByText("Board games")).toBeVisible();

  // Step 3: game picker — search fires at >= 4 chars; BGG may be
  // unavailable in CI, so selecting is best-effort: if the search returns
  // results, pick the first game; otherwise assert the empty state blocks
  // the next FAB.
  await page
    .getByRole("button", { name: /Select a board game/ })
    .first()
    .click();
  await expect(page.getByPlaceholder(/Search board games/)).toBeVisible();
  const gameSearch = page.getByPlaceholder(/Search board games/);
  await gameSearch.fill("Cascadia");

  const gameRow = page.getByRole("button", { name: "Select" }).first();
  try {
    await gameRow.waitFor({ state: "visible", timeout: 30_000 });
    await gameRow.click();
  } catch {
    // No games in the local collection yet (preview DB not imported) or BGG
    // unreachable — the empty state must block. Target the search-results
    // empty message only (not the "at least 4 characters" hint).
    const emptyState = page.getByText("No games found");
    if (await emptyState.isVisible().catch(() => false)) {
      await page.getByLabel("Back").click();
      await expect(page.getByLabel("Next step")).toBeDisabled();
      return;
    }
    // Otherwise the search errored (BGG down) — still expect the block.
    await page.getByLabel("Back").click();
    await expect(page.getByLabel("Next step")).toBeDisabled();
    return;
  }

  // Back on the wizard with the game selected.
  await expect(page.getByText("Board games")).toBeVisible();
  await expect(page.getByText("Cascadia").first()).toBeVisible();

  // Submit: create the match, back on the list.
  const createResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/api/matches"),
  );
  await nextFab.click();
  expect((await createResponse).ok()).toBe(true);
  await expect(page.getByText(/Friday night games/)).toBeVisible({ timeout: 30_000 });
});
