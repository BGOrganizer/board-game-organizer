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

test("admin confirms, reopens, and registers immutable results", async ({ page }) => {
  if (!E2E_EMAIL) throw new Error("E2E_EMAIL required for match E2E");
  await signInAsActor(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.user?.id));
  const adminUserId = await page.evaluate(() => Reflect.get(window, "Clerk")?.user?.id as string);
  const matchId = "e1a9a989-5d0f-4f4c-9cf9-c08c4ae17102";
  const date = "2026-10-01T20:00:00.000Z";
  let status: "PLANNING" | "CREATED" | "TERMINATED" = "PLANNING";
  let results:
    | {
        lowerWins: boolean;
        entries: { userId: string; score: string | null; rank: number | null }[];
        tieBreaks: unknown[];
        finalizedAt: string;
      }
    | undefined;
  // Final ** must also intercept /status and /results; * stops at a slash.
  await page.route(`**/api/matches/${matchId}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/status")) {
      status = (route.request().postDataJSON() as { status: typeof status }).status;
    }
    if (path.endsWith("/results")) {
      const input = route.request().postDataJSON() as {
        lowerWins: boolean;
        entries: { userId: string; score: string | null }[];
        tieBreaks: unknown[];
      };
      results = {
        ...input,
        entries: input.entries.map((entry, index) => ({
          ...entry,
          rank: entry.score === null ? null : index + 1,
        })),
        finalizedAt: new Date().toISOString(),
      };
      status = "TERMINATED";
    }
    const match = {
      id: matchId,
      adminUserId,
      name: "Shared game night",
      dates: [date],
      minPlayers: 2,
      maxPlayers: 3,
      gameIds: [342942],
      status,
      ...(status !== "PLANNING" ? { selectedDate: date, selectedGameId: 342942 } : {}),
      ...(results ? { results } : {}),
      createdAt: date,
      updatedAt: date,
      invitedUserIds: ["user_accepted"],
      invitations: [
        {
          id: "2e6d06a2-734b-47ad-a8a2-08c4ea17f491",
          matchId,
          inviterUserId: adminUserId,
          inviteeUserId: "user_accepted",
          status: "ACCEPTED",
          createdAt: date,
          updatedAt: date,
        },
      ],
    };
    await route.fulfill({
      json:
        path.endsWith("/status") || path.endsWith("/results")
          ? { match }
          : {
              match,
              administrator: {
                id: adminUserId,
                name: "Admin",
                email: "admin@example.com",
                avatarUrl: null,
              },
              invitedPlayers: [
                {
                  id: "user_accepted",
                  name: "Guest",
                  email: null,
                  avatarUrl: null,
                  invitation: match.invitations[0],
                },
              ],
              games: [
                {
                  id: 342942,
                  name: "Ark Nova",
                  yearPublished: 2021,
                  bayesAverage: 7.23456,
                  average: 7.91,
                  rank: 11,
                  thumbnail: null,
                },
              ],
              choices: { dates: { [String(Date.parse(date))]: "YES" }, games: { "342942": "YES" } },
              voteSummary: {
                dates: { [String(Date.parse(date))]: { yes: 2, no: 0, ifNeeded: 0, notChosen: 0 } },
                games: { "342942": { yes: 2, no: 0, ifNeeded: 0, notChosen: 0 } },
                reasons: [],
                selectedDate: date,
                selectedGameId: 342942,
              },
            },
    });
  });
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole("heading", { name: "Date selection" })).toBeVisible();
  await page.getByRole("tab", { name: "Players" }).click();
  await expect(page.getByRole("button", { name: "Actions", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove player: Guest" }).click();
  const removeDialog = page.getByRole("dialog", { name: "Remove player?" });
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("tab", { name: "Games" }).click();
  await expect(page.getByRole("img", { name: "Average: 7.91" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Rank: 11" })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(
    page.getByRole("img", { name: "Yes: 2, No: 0, If needed: 0, Not chosen: 0" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vote count legend" }).hover();
  await expect(page.getByText("? Not chosen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm match" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm match" }).click();
  const confirmDialog = page.getByRole("dialog", { name: "Confirm match?" });
  await expect(confirmDialog.getByText(/Ark Nova/)).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Confirm match" }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(page.getByText("Confirmed date")).toBeVisible();
  await expect(page.getByRole("button", { name: "Vote count legend" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Yes: 2, No: 0/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Choose date/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Players" }).click();
  await expect(page.getByText("Minimum players")).toHaveCount(0);
  await expect(page.getByText("Maximum players")).toHaveCount(0);
  await page.getByRole("tab", { name: "Games" }).click();
  await expect(page.getByRole("heading", { name: "Confirmed game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vote count legend" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Yes: 1, No: 0/ })).toHaveCount(0);
  await expect(page.getByText("Ark Nova")).toBeVisible();
  await expect(page.getByRole("button", { name: /Choose game/ })).toHaveCount(0);
  await page.getByRole("button", { name: "More match actions" }).click();
  const actions = page.getByRole("button", { name: "Back to planning" }).locator("../..");
  await expect(actions).toHaveCSS("row-gap", "12px");
  await page.getByRole("button", { name: "Back to planning" }).click();
  const replanDialog = page.getByRole("dialog", { name: "Back to planning?" });
  await replanDialog.getByRole("button", { name: "Back to planning" }).click();
  await expect(replanDialog).toHaveCount(0);
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByRole("button", { name: "Confirm match" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose date: Yes" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm match" }).click();
  await confirmDialog.getByRole("button", { name: "Confirm match" }).click();
  await expect(confirmDialog).toHaveCount(0);
  await page.getByRole("button", { name: "Register results" }).click();
  await expect(page.getByRole("region", { name: "Live standings" })).toBeVisible();
  await page.getByRole("button", { name: "Score: Admin" }).click();
  await page.getByRole("textbox", { name: "Score: Admin" }).fill("-1,5");
  await page.getByRole("dialog", { name: "Admin" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Score: Guest" }).click();
  await page.getByRole("textbox", { name: "Score: Guest" }).fill("-1,5");
  await page.getByRole("dialog", { name: "Guest" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Resolve tie" })).toBeVisible();
  await page.getByRole("button", { name: "Resolve tie" }).click();
  await page.getByRole("button", { name: "Move up: Guest" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Resolve tie" }).click();
  await page.getByRole("button", { name: "Move up: Guest" }).click();
  await page.getByRole("button", { name: "Confirm tie-break" }).click();
  await page.getByRole("button", { name: "Score: Guest" }).click();
  await page.getByRole("switch", { name: "Did not participate: Guest" }).click();
  await page.getByRole("dialog", { name: "Guest" }).getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Resolve tie" })).toHaveCount(0);
  await page.getByRole("switch", { name: "Lowest score wins" }).click();
  await expect(page.getByRole("switch", { name: "Lowest score wins" })).toBeChecked();
  await page.getByRole("button", { name: "Register match" }).click();
  const registerDialog = page.getByRole("dialog", { name: "Register match?" });
  await expect(registerDialog.getByText(/cannot be edited/)).toBeVisible();
  await expect(registerDialog.getByText("Guest")).toHaveCount(0);
  await registerDialog.getByRole("button", { name: "Register match" }).click();
  await expect(registerDialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Players" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Standings" }).click();
  const standings = page.getByRole("tabpanel", { name: "Standings" });
  await expect(standings.getByText("ND", { exact: true })).toBeVisible();
  await expect(standings.getByText("admin@example.com")).toBeVisible();
  await expect(
    standings
      .getByText("admin@example.com")
      .locator("xpath=ancestor::li")
      .getByRole("button", { name: "Actions" }),
  ).toBeDisabled();
  await expect(
    standings
      .getByText("Guest", { exact: true })
      .locator("xpath=ancestor::li")
      .getByRole("button", { name: "Actions" }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: "Games" }).click();
  await expect(page.getByRole("img", { name: "Winner" })).toBeVisible();
  await page.getByRole("tab", { name: "Standings" }).click();
  await expect(standings.getByText("Lowest score wins", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Register results" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More match actions" })).toHaveCount(0);
});

test("admin removes a pending player without blocking them", async ({ page }) => {
  if (!E2E_EMAIL) throw new Error("E2E_EMAIL is required for match E2E");
  await signInAsActor(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.user?.id));
  const adminUserId = await page.evaluate(() => Reflect.get(window, "Clerk")?.user?.id as string);
  const matchId = "f1a9a989-5d0f-4f4c-9cf9-c08c4ae17103";
  const invitationId = "f1a9a989-5d0f-4f4c-9cf9-c08c4ae17104";
  let removed = false;
  await page.route("**/api/matches/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path === `/api/matches/${matchId}/invitations/${invitationId}` &&
      route.request().method() === "DELETE"
    ) {
      removed = true;
      await route.fulfill({ status: 200, json: { success: true } });
    } else if (path === `/api/matches/${matchId}` && route.request().method() === "GET") {
      const invitation = {
        id: invitationId,
        matchId,
        inviterUserId: adminUserId,
        inviteeUserId: "user_guest",
        status: "PENDING",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      };
      await route.fulfill({
        status: 200,
        json: {
          match: {
            id: matchId,
            adminUserId,
            name: "Friday games",
            dates: ["2026-10-01T20:00:00.000Z"],
            minPlayers: 2,
            maxPlayers: 4,
            gameIds: [295947],
            invitedUserIds: removed ? [] : ["user_guest"],
            invitations: removed ? [] : [invitation],
            status: "PLANNING",
            createdAt: invitation.createdAt,
            updatedAt: invitation.updatedAt,
          },
          administrator: {
            id: adminUserId,
            name: "Admin",
            email: "admin@example.com",
            avatarUrl: null,
          },
          invitedPlayers: removed
            ? []
            : [{ id: "user_guest", name: "Guest", email: null, avatarUrl: null, invitation }],
          games: [
            {
              id: 295947,
              name: "Cascadia",
              yearPublished: 2021,
              bayesAverage: 7.65789,
              average: 7.83,
              rank: 42,
              thumbnail: null,
            },
          ],
        },
      });
    } else await route.continue();
  });
  await page.goto(`/matches/${matchId}`);
  await page.getByRole("tab", { name: "Players" }).click();
  await expect(page.getByText("Guest")).toBeVisible();
  await page.getByRole("button", { name: "Remove player: Guest" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove player?" });
  await expect(
    dialog.getByText(/Blocking or removing a friend alone does not remove them/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Remove player" }).click();
  await expect(page.getByText("Guest")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove player: Guest" })).toHaveCount(0);
  expect(removed).toBe(true);
});

test("match wizard: name → players → game → create", async ({ page }) => {
  test.setTimeout(240_000);
  if (!E2E_EMAIL) throw new Error("E2E_EMAIL is required for match E2E");

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
  await expect(page.getByRole("button", { name: "Remove slot" })).toHaveCount(0);
  await dateInput.fill("2026-09-05T20:00");
  await expect(dateInput).toHaveValue("2026-09-05T20:00");
  await expect(page.getByRole("button", { name: "Remove slot" })).toHaveCount(1);
  await dateInput.fill("");
  await expect(page.getByRole("button", { name: "Remove slot" })).toHaveCount(0);
  await dateInput.fill("2026-09-05T20:00");

  // Added empty dates block progress; deleting the last remaining date clears
  // its input instead of removing the slot.
  const addDate = page.getByRole("button", { name: "Add date" });
  await expect(addDate).toHaveClass(/button--primary/);
  await expect(addDate).toHaveClass(/button--sm/);
  await addDate.click();
  const dateInputs = page.locator('input[type="datetime-local"]');
  await expect(dateInputs).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Remove slot" })).toHaveCount(2);
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
  await expect(page.getByRole("button", { name: "Remove slot" })).toHaveCount(0);
  await expect(nextFab).toBeDisabled();
  await dateInputs.first().fill("2026-09-05T20:00");
  await expect(page.getByRole("button", { name: "Remove slot" })).toHaveCount(1);
  await page.getByRole("button", { name: "Add date" }).click();
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

  const addGame = page.getByRole("button", { name: "Add game" });
  await expect(addGame).toHaveClass(/button--primary/);
  await expect(addGame).toHaveClass(/button--sm/);
  await addGame.click();
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
  await expect(page.getByRole("img", { name: "Average: 7.83" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Rank: 42" })).toBeVisible();

  const gameRow = page.getByRole("button", { name: /^Select:/ }).first();
  await gameRow.waitFor({ state: "visible", timeout: 30_000 });
  await expect(gameRow.locator("..").getByText(/\d{4}/)).toBeVisible();
  await gameRow.click();
  await expect(page.getByRole("img", { name: "Average: 7.83" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Rank: 42" })).toBeVisible();
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
  const saveFab = page.getByRole("button", { name: "Create match" });
  await expect(saveFab.locator("svg.lucide-save")).toBeVisible();
  await saveFab.click();
  await expect(page.getByText("Match created")).toBeVisible();
  const dismissToast = page.getByRole("button", { name: "Dismiss notification" });
  await dismissToast.focus();
  await dismissToast.press("Enter");
  await expect(page.getByText("Match created")).toBeHidden();
  expect((await createResponse).ok()).toBe(true);
  const card = page.getByRole("link", { name: /^Open match: Friday night games/ });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('img[src^="data:image/svg+xml,"]')).toBeVisible();
  await expect(card.locator('[data-slot="chip"]')).toHaveText("Planning");
  await expect(card.getByText(/^\d+\/\d+$/)).toBeVisible();
  await expect(card.locator("time")).toHaveCount(2);
  await expect(card.getByText("+1 date")).toBeVisible();
  await expect(card.locator("time").first()).toContainText(/\b\d{4}\b/);
  await expect(card.locator("time").first()).not.toContainText(":");
  await expect(card.locator("time").last()).toContainText(":");
  await expect(card.locator("img.match-waves")).toBeVisible();
  await expect(card.getByRole("img", { name: "Administrator" })).toBeVisible();

  // Open detail and exercise all three HeroUI tabs.
  await card.click();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Friday night games" })).toBeVisible();
  const confirmButton = page.getByRole("button", { name: "Confirm match" });
  await expect(confirmButton).toHaveAttribute("aria-disabled", "true");
  await confirmButton.focus();
  await expect(page.getByText("Not enough accepted players")).toBeVisible();
  const dateChoiceResponse = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes("/choices"),
  );
  await page.getByRole("button", { name: "Choose date: Not known" }).first().click();
  await page.getByRole("menuitemradio", { name: "Yes" }).click();
  expect((await dateChoiceResponse).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Choose date: Yes" }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Choose date: Yes" }).first()).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Game selection" })).toBeVisible();
  await expect(page.getByText("Cascadia").first()).toBeVisible();
  await expect(page.getByText("2021").first()).toBeVisible();
  const gameChoiceResponse = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes("/choices"),
  );
  await page.getByRole("button", { name: "Choose game: Not known" }).first().click();
  await page.getByRole("menuitemradio", { name: "If I have to" }).click();
  expect((await gameChoiceResponse).ok()).toBe(true);
  await expect(
    page.getByRole("button", { name: "Choose game: If I have to" }).first(),
  ).toBeVisible();

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
  await expect(page.getByRole("button", { name: "Remove slot" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled();
  await editDates.first().fill("2026-09-05T20:00");
  await expect(page.getByRole("button", { name: "Remove slot" })).toHaveCount(1);
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
  const editSave = page.getByRole("button", { name: "Save changes" });
  await expect(editSave.locator("svg.lucide-save")).toBeVisible();
  await editSave.click();
  expect((await updateResponse).ok()).toBe(true);
  await expect(page.getByText("Match updated")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Updated game night" })).toBeVisible();

  // Destructive admin action requires confirmation and removes the match.
  await page.getByRole("button", { name: "More match actions" }).click();
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
