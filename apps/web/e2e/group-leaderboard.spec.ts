import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

const email = process.env.E2E_EMAIL ?? "";
const groupId = "1f454adb-43e3-47ad-8c29-57b97a55a211";

async function chooseGame(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: /Board game/ }).click();
  await page.getByRole("option", { name }).click();
}

test("group leaderboard filters played games and marks former members", async ({ page }) => {
  if (!email) throw new Error("E2E_EMAIL required group leaderboard E2E");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.user?.id));
  const adminUserId = await page.evaluate(() => Reflect.get(window, "Clerk")?.user?.id as string);
  let hasMatches = false;
  let formerMember = true;
  await page.route("**/api/groups**", (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (url.pathname === "/api/groups")
      return route.fulfill({
        json: {
          groups: [
            {
              id: groupId,
              name: "Tabletop Club",
              adminUserId,
              isPublic: false,
              memberCount: 1,
              invitations: [],
              memberProfiles: [{ id: adminUserId, name: "E2E Test", email: null, avatarUrl: null }],
              createdAt: "2026-10-01T20:00:00.000Z",
              updatedAt: "2026-10-01T20:00:00.000Z",
            },
          ],
        },
      });
    if (url.pathname.endsWith("/leaderboard")) {
      const gameId = url.searchParams.get("gameId");
      const games = hasMatches
        ? [
            { id: 1, name: "Azul", imageUrl: "data:image/svg+xml,%3Csvg/%3E" },
            { id: 2, name: "Cascadia", imageUrl: null },
          ]
        : [];
      const players =
        gameId === "1"
          ? [
              {
                userId: adminUserId,
                name: "Ada Lovelace",
                username: "ada",
                avatarUrl: null,
                gamesPlayed: 2,
                gamesWon: 1,
                nd: 1,
                rating: 524.5,
                provisional: true,
                left: false,
              },
              {
                userId: "former",
                name: "Grace Hopper",
                username: "grace",
                avatarUrl: null,
                gamesPlayed: 1,
                gamesWon: 0,
                nd: 1,
                rating: 501,
                provisional: false,
                left: formerMember,
              },
            ]
          : gameId === "2"
            ? [
                {
                  userId: adminUserId,
                  name: "Ada Lovelace",
                  username: "ada",
                  avatarUrl: null,
                  gamesPlayed: 1,
                  gamesWon: 1,
                  nd: 0,
                  rating: 520,
                  provisional: true,
                  left: false,
                },
              ]
            : [];
      return route.fulfill({ json: { games, players, nextCursor: null } });
    }
    return route.continue();
  });

  await page.goto(`/groups/${groupId}`);
  await expect(page.getByRole("tab", { name: "Settings" })).toBeVisible();
  await page.getByRole("tab", { name: "Leaderboards" }).click();
  await expect(page.getByText("No matches played in this group yet")).toBeVisible();
  await expect(page.getByRole("button", { name: /Board game/ })).toHaveCount(0);

  hasMatches = true;
  await page.reload();
  await page.getByRole("tab", { name: "Leaderboards" }).click();
  await chooseGame(page, "Azul");
  await expect(
    page.getByRole("button", { name: /Azul Board game/ }).locator("img"),
  ).toHaveAttribute("src", /data:image/);
  const ada = page.getByRole("row", { name: /Ada Lovelace/ });
  await expect(ada).toContainText("@ada");
  await expect(ada).toContainText("524.5");
  await expect(ada.getByRole("img", { name: "Provisional rating" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "ND" })).toBeVisible();
  await expect(ada.getByRole("cell").nth(3)).toHaveText("1");
  const grace = page.getByRole("row", { name: /Grace Hopper/ });
  await expect(grace).toContainText("@grace");
  await expect(grace).toContainText("Former group member");
  await expect(grace).toHaveClass(/opacity-60/);
  await expect(grace.getByRole("cell").nth(3)).toHaveText("1");
  await expect(grace).not.toContainText("@example.com");

  await chooseGame(page, "Cascadia");
  await expect(page.getByRole("row", { name: /Grace Hopper/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Ada Lovelace/ })).toContainText("520");

  formerMember = false;
  await page.reload();
  await page.getByRole("tab", { name: "Leaderboards" }).click();
  await chooseGame(page, "Azul");
  await expect(page.getByRole("row", { name: /Grace Hopper/ })).not.toContainText(
    "Former group member",
  );
  await page.getByRole("button", { name: "Clear board game selection" }).click();
  await expect(page.getByRole("grid", { name: "Group leaderboard" })).not.toBeVisible();
});
