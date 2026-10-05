import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

// UI acceptance uses controlled responses; replica-set tests cover real authorization,
// membership, duplicate handling and capacity races. No public listing is added.
test("link-based pending requests, failures, admin approval and rejection", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  if (!email) throw new Error("E2E_EMAIL is required for match join E2E");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await completeMobileNumberIfNeeded(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.user?.id));
  const userId = await page.evaluate(() => Reflect.get(window, "Clerk")?.user?.id as string);
  const viewerMatch = "f5a9a989-5d0f-4f4c-9cf9-c08c4ae17102";
  const adminMatch = "f6a9a989-5d0f-4f4c-9cf9-c08c4ae17102";
  const invitationId = "2e6d06a2-734b-47ad-a8a2-08c4ea17f491";
  const date = "2099-10-01T20:00:00.000Z";
  let phase: "empty" | "pending" | "accepted" = "empty";
  let failWrite = true;
  await page.route(/\/api\/matches\/(f5a9a989|f6a9a989).*/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const isAdmin = path.includes(adminMatch);
    const matchId = isAdmin ? adminMatch : viewerMatch;
    const adminUserId = isAdmin ? userId : "user_other";
    const requesterId = isAdmin ? "user_other" : userId;
    const invitation = {
      id: invitationId,
      matchId,
      inviterUserId: adminUserId,
      inviteeUserId: requesterId,
      status: phase === "accepted" ? "ACCEPTED" : "PENDING",
      kind: "REQUEST",
      createdAt: date,
      updatedAt: date,
    };
    if (route.request().method() !== "GET") {
      if (failWrite) {
        failWrite = false;
        await route.fulfill({ status: 409, json: { error: "Changed concurrently" } });
        return;
      }
      if (path.includes("/join-requests")) {
        phase = route.request().method() === "POST" ? "pending" : "accepted";
        await route.fulfill({
          status: route.request().method() === "POST" ? 201 : 200,
          json: {
            invitation: { ...invitation, status: phase === "accepted" ? "ACCEPTED" : "PENDING" },
          },
        });
      } else {
        phase = "empty";
        await route.fulfill({ json: { ok: true } });
      }
      return;
    }
    if (path.endsWith("/leaderboard")) {
      await route.fulfill({ json: { gameId: 1, ratings: [] } });
      return;
    }
    const match = {
      id: matchId,
      adminUserId,
      name: "Public planning night",
      isPublic: true,
      dates: [date],
      minPlayers: 2,
      maxPlayers: 2,
      gameIds: [1],
      locations: [],
      status: "PLANNING",
      createdAt: date,
      updatedAt: date,
      invitedUserIds: phase === "empty" ? [] : [requesterId],
      invitations: phase === "empty" ? [] : [invitation],
    };
    await route.fulfill({
      json: {
        match,
        canRequestJoin: !isAdmin && phase === "empty",
        administrator: {
          id: adminUserId,
          name: "Admin",
          email: "admin@example.com",
          avatarUrl: null,
        },
        invitedPlayers:
          phase === "empty"
            ? []
            : [
                {
                  invitation,
                  id: requesterId,
                  name: "Requester",
                  email: "requester@example.com",
                  avatarUrl: null,
                },
              ],
        games: [{ id: 1, name: "Azul", yearPublished: 2017, thumbnail: null }],
        choices: { dates: {}, games: {} },
      },
    });
  });
  await page.goto(`/matches/${viewerMatch}`);
  await page.getByRole("button", { name: "Request to join" }).click();
  await expect(page.getByText("Could not request to join match").first()).toBeVisible();
  await page.getByRole("button", { name: "Request to join" }).click();
  await expect(page.getByText("Your join request is waiting for admin approval.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request to join" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Leaderboards" })).toHaveCount(0);

  await page.goto(`/matches/${adminMatch}`);
  await page.getByRole("tab", { name: "Players" }).click();
  failWrite = true;
  await page.getByRole("button", { name: "Approve join request: Requester" }).click();
  await expect(page.getByText("Could not approve join request")).toBeVisible();
  await page.getByRole("button", { name: "Approve join request: Requester" }).click();
  await expect(page.getByRole("button", { name: "Approve join request: Requester" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Remove player: Requester" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove player", exact: true })
    .click();
  await expect(page.getByText("Requester", { exact: true })).toHaveCount(0);
  phase = "pending";
  await page.reload();
  await page.getByRole("tab", { name: "Players" }).click();
  await expect(page.getByRole("button", { name: "Approve join request: Requester" })).toBeVisible();
  await page.getByRole("button", { name: "Remove player: Requester" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove player", exact: true })
    .click();
  await expect(page.getByText("Requester", { exact: true })).toHaveCount(0);
});
