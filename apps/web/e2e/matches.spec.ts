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

  // Added empty dates block progress; deleting the last remaining date clears
  // its input instead of removing the slot.
  await page.getByRole("button", { name: "Add another date" }).click();
  const dateInputs = page.locator('input[type="datetime-local"]');
  await expect(dateInputs).toHaveCount(2);
  const nextFab = page.locator('button[aria-label="Next step"]');
  await expect(nextFab).toBeDisabled(); // second date still empty
  await dateInputs.nth(1).fill("2026-09-06T21:00");
  await expect(dateInputs.nth(1)).toHaveValue("2026-09-06T21:00");
  const removeDate = page.getByRole("button", { name: "Remove slot" }).last();
  await expect(removeDate).toHaveClass(/button--danger-soft/);
  await expect(removeDate.locator("..").locator('input[type="datetime-local"]')).toBeVisible();
  await removeDate.click();
  await expect(dateInputs).toHaveCount(1);
  const clearLastDate = page.getByRole("button", { name: "Remove slot" });
  await expect(clearLastDate).toBeEnabled();
  await clearLastDate.click();
  await expect(dateInputs).toHaveCount(1);
  await expect(dateInputs.first()).toHaveValue("");
  await expect(nextFab).toBeDisabled();
  await dateInputs.first().fill("2026-09-05T20:00");
  await page.getByRole("button", { name: "Add another date" }).click();
  await dateInputs.nth(1).fill("2026-09-06T21:00");

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
  const addBtn = page.getByRole("button", { name: /^Add:/ }).first();
  let friendPicked = false;
  let pickedFriendLabel: string | null = null;
  try {
    await addBtn.waitFor({ state: "visible", timeout: 10_000 });
    pickedFriendLabel = await addBtn.getAttribute("aria-label");
    await addBtn.click();
    friendPicked = true;
  } catch {
    // No friends available — the picker is empty.
  }
  if (!friendPicked) await page.getByLabel("Back").click();
  await expect(page.getByText("Players")).toBeVisible();

  if (pickedFriendLabel) {
    const friendsLoaded = page.waitForResponse(
      (response) => response.url().includes("/api/relationships?type=friends") && response.ok(),
    );
    await page
      .getByRole("button", { name: /Select a friend/ })
      .first()
      .click();
    await friendsLoaded;
    await expect(page.getByRole("button", { name: pickedFriendLabel })).toHaveCount(0);
    await page.getByLabel("Back").click();
  }

  // Advance to step 3; invitations are optional while planning.
  await nextFab.click();
  await expect(page.getByText("Board games")).toBeVisible();

  await page.getByRole("button", { name: "Add another game" }).click();
  await expect(page.getByRole("button", { name: /Select a board game/ })).toHaveCount(2);
  const removeEmptyGame = page.getByRole("button", { name: "Remove game" }).last();
  await expect(removeEmptyGame).toHaveClass(/button--danger-soft/);
  await expect(
    removeEmptyGame.locator("..").getByRole("button", { name: /Select a board game/ }),
  ).toBeVisible();
  await removeEmptyGame.click();
  await expect(page.getByRole("button", { name: /Select a board game/ })).toHaveCount(1);

  // Cascadia is seeded in the isolated CI database.
  await page
    .getByRole("button", { name: /Select a board game/ })
    .first()
    .click();
  await expect(page.getByPlaceholder(/Search board games/)).toBeVisible();
  const gameSearch = page.getByPlaceholder(/Search board games/);
  await gameSearch.fill("Cascadia");

  const gameRow = page.getByRole("button", { name: /^Select:/ }).first();
  await gameRow.waitFor({ state: "visible", timeout: 30_000 });
  await expect(gameRow.locator("..").getByText(/\d{4}/)).toBeVisible();
  await gameRow.click();
  // Removing a selected game clears its slot without opening the picker.
  await expect(page.getByText("Cascadia").first()).toBeVisible();
  const removeSelectedGame = page.getByRole("button", { name: "Remove game" });
  await expect(removeSelectedGame).toHaveClass(/button--danger-soft/);
  await removeSelectedGame.click();
  await expect(page.getByRole("button", { name: /Select a board game/ })).toBeVisible();
  await page.getByRole("button", { name: /Select a board game/ }).click();
  await page.getByPlaceholder(/Search board games/).fill("Cascadia");
  await page
    .getByRole("button", { name: /^Select:/ })
    .first()
    .click();

  // Back on the wizard with the game selected.
  await expect(page.getByText("Board games")).toBeVisible();
  await expect(page.getByText("Cascadia").first()).toBeVisible();

  // Submit: create the match, back on the list.
  const createResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/api/matches"),
  );
  await nextFab.click();
  await expect(page.getByText("Match created")).toBeVisible();
  expect((await createResponse).ok()).toBe(true);
  await expect(page.getByText(/Friday night games/)).toBeVisible({ timeout: 30_000 });

  // Open detail and exercise all three HeroUI tabs.
  await page.getByRole("link", { name: "Open match: Friday night games" }).click();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Friday night games" })).toBeVisible();

  await page.getByRole("tab", { name: "Players" }).click();
  await expect(page.getByText("Minimum players")).toBeVisible();
  await expect(page.getByText("Maximum players")).toBeVisible();
  await expect(page.getByText("Participants")).toBeVisible();
  await expect(page.getByRole("img", { name: "Administrator" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Accepted" })).toBeVisible();
  if (pickedFriendLabel) {
    await expect(page.getByText(pickedFriendLabel.replace(/^Add:\s*/, ""))).toBeVisible();
  }

  await page.getByRole("tab", { name: "Games" }).click();
  await expect(page.getByText("Cascadia").first()).toBeVisible();
  await expect(page.getByText("2021").first()).toBeVisible();

  // Admin edits reuse the creation wizard and persist only on the final step.
  await page.getByRole("button", { name: "Edit match" }).click();
  await expect(page.getByRole("heading", { name: "Edit match" })).toBeVisible();
  await page.getByRole("textbox", { name: "Match name" }).fill("Updated game night");
  const editDates = page.locator('input[type="datetime-local"]');
  await expect(editDates).toHaveCount(2);
  await page.getByRole("button", { name: "Remove slot" }).last().click();
  await expect(editDates).toHaveCount(1);
  await page.getByRole("button", { name: "Remove slot" }).click();
  await expect(editDates).toHaveCount(1);
  await expect(editDates.first()).toHaveValue("");
  await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
  await editDates.first().fill("2026-09-05T20:00");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();
  if (pickedFriendLabel) {
    const removeInvite = page.getByRole("button", { name: "Remove invite" });
    await expect(removeInvite).toHaveClass(/button--danger-soft/);
    await expect(removeInvite.locator("..").locator("button")).toHaveCount(2);
    await removeInvite.click();
    await expect(page.getByRole("button", { name: "Remove invite" })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("heading", { name: "Board games" })).toBeVisible();
  const updateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes("/api/matches/") &&
      !response.url().includes("/invitations"),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await updateResponse).ok()).toBe(true);
  await expect(page.getByText("Match updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Updated game night" })).toBeVisible();

  // Destructive admin action requires confirmation and removes the match.
  await page.getByRole("button", { name: "Delete match" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete match?" });
  await expect(deleteDialog).toBeVisible();
  const deleteResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      response.url().includes("/api/matches/") &&
      !response.url().includes("/invitations"),
  );
  await deleteDialog.getByRole("button", { name: "Delete match" }).click();
  expect((await deleteResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByText("Updated game night")).toHaveCount(0);
});
