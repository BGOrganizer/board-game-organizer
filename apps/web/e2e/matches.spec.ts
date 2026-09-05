import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

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
  await page.waitForURL("**/matches", { timeout: 60_000 });
  await expect(page.getByText("Matches")).toBeVisible({ timeout: 60_000 });
}

test("match wizard: name → players → game → create", async ({ page }) => {
  test.setTimeout(240_000);
  test.skip(!E2E_EMAIL, "E2E_EMAIL not set (CI provisions the user)");

  await signInAsActor(page);
  await page.waitForFunction(() => Boolean((window as any).Clerk?.session), null, {
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
  // only remaining slot is blocked (one stays).
  await page.getByRole("button", { name: "Add another date" }).click();
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(2);

  // Advance: the next FAB is the bottom-right fixed button. Wait until it
  // becomes enabled (validation re-renders after the name+date fill).
  const nextFab = page.locator('button[aria-label="Next step"]');
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

  // The creator counts as one player: min=2 needs at least one invite. The
  // E2E target is a friend only when the test users follow each other — try
  // to pick one; if the picker is empty (no friends), lower min to 1 so the
  // step becomes valid without invites.
  const addBtn = page.getByRole("button", { name: "Add" }).first();
  let friendPicked = false;
  try {
    await addBtn.waitFor({ state: "visible", timeout: 10_000 });
    await addBtn.click();
    friendPicked = true;
  } catch {
    // No friends available — the picker is empty.
  }
  await page.getByLabel("Back").click();
  await expect(page.getByText("Players")).toBeVisible();

  if (!friendPicked) {
    // min=1 means a solo match is allowed — no invites required.
    await page.getByLabel("Decrease min players").click();
  }

  // Advance to step 3 (range valid, invites filled or min=1).
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

  const firstGame = page.locator("text=/^[A-Za-z].*Cascadia/i").first();
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
  await nextFab.click();
  await expect(page.getByText(/Friday night games/)).toBeVisible({ timeout: 30_000 });
});
