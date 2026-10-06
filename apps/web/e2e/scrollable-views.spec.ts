import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

const uuid = (number: number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const matchId = uuid(100);
const groupId = uuid(200);
const date = "2026-10-01T20:00:00.000Z";
const game = {
  id: 295947,
  name: "Cascadia",
  thumbnail: null,
  yearPublished: 2021,
  average: 7.83,
  bayesAverage: 7.65,
  rank: 42,
};

async function signIn(page: Page) {
  const email = process.env.E2E_EMAIL;
  if (!email) throw new Error("E2E_EMAIL is required for scroll and location E2E");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.user?.id));
  const userId = await page.evaluate(() => Reflect.get(window, "Clerk")?.user?.id);
  if (!userId) throw new Error("Missing authenticated user");
  return userId;
}

async function assertScrollableEnd(page: Page, last: Locator, fabLabel?: string) {
  const region = page.locator("#tab-content-scroll");
  await last.scrollIntoViewIfNeeded();
  await region.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(last).toBeVisible();
  expect(await region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const bounds = await last.boundingBox();
  const viewport = await region.boundingBox();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!bounds || !viewport) throw new Error("Missing scroll geometry");
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.y + viewport.height);
  if (fabLabel) {
    const fab = await page.getByRole("button", { name: fabLabel, exact: true }).boundingBox();
    if (!fab) throw new Error("Missing FAB geometry");
    expect(bounds.y + bounds.height).toBeLessThan(fab.y);
  }
}

for (const width of [390, 1280]) {
  test(`every match tab and group view scrolls clear of the FAB at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 650 });
    const adminUserId = await signIn(page);
    const admin = {
      id: adminUserId,
      name: "Organizer",
      email: "organizer@example.test",
      avatarUrl: null,
    };
    const guests = Array.from({ length: 14 }, (_, index) => ({
      id: `user_scroll_${index}`,
      name: `Guest ${index + 1}`,
      email: `guest${index + 1}@example.test`,
      avatarUrl: null,
    }));
    const locations = guests.map((_, index) => ({
      id: uuid(300 + index),
      name: `Cafe ${index + 1}`,
      address: "Verified address, Rome, Italy",
      longitude: 12.5,
      latitude: 41.9,
    }));
    let terminated = false;
    await page.route(`**/api/matches/${matchId}**`, async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/leaderboard")) {
        return route.fulfill({
          json: {
            gameId: game.id,
            ratings: [admin, ...guests].map((player) => ({
              userId: player.id,
              score: 500,
              provisional: false,
              gamesPlayed: 5,
              gamesWon: 1,
              nd: 0,
            })),
          },
        });
      }
      const invitations = guests.map((guest, index) => ({
        id: uuid(400 + index),
        matchId,
        inviterUserId: adminUserId,
        inviteeUserId: guest.id,
        status: "ACCEPTED",
        createdAt: date,
        updatedAt: date,
      }));
      const match = {
        id: matchId,
        adminUserId,
        name: "Scrollable match",
        dates: [date],
        locations,
        minPlayers: 2,
        maxPlayers: 20,
        gameIds: [game.id],
        status: terminated ? "TERMINATED" : "PLANNING",
        createdAt: date,
        updatedAt: date,
        invitations,
        ...(terminated
          ? {
              selectedDate: date,
              selectedGameId: game.id,
              selectedLocationId: locations[0].id,
              results: {
                lowerWins: false,
                entries: [admin, ...guests].map((player, index) => ({
                  userId: player.id,
                  rank: index + 1,
                  score: String(100 - index),
                })),
                tieBreaks: [],
                finalizedAt: date,
              },
            }
          : {}),
      };
      return route.fulfill({
        json: {
          match,
          administrator: admin,
          invitedPlayers: guests.map((guest, index) => ({
            ...guest,
            invitation: invitations[index],
          })),
          games: [game],
          choices: { dates: {}, locations: {}, games: {} },
        },
      });
    });
    await page.route(`**/api/groups/${groupId}**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/leaderboard"))
        return route.fulfill({
          json: {
            games: [{ id: game.id, name: game.name, imageUrl: null }],
            players: url.searchParams.has("gameId")
              ? guests.map((guest) => ({
                  userId: guest.id,
                  name: guest.name,
                  username: null,
                  avatarUrl: null,
                  gamesPlayed: 5,
                  gamesWon: 1,
                  nd: 0,
                  rating: 500,
                  provisional: false,
                  left: false,
                }))
              : [],
            nextCursor: null,
          },
        });
      return route.fulfill({
        json: {
          group: {
            id: groupId,
            adminUserId,
            name: "Scrollable group",
            isPublic: false,
            memberCount: 15,
            memberProfiles: [admin, ...guests],
            invitations: guests.map((guest, index) => ({
              id: uuid(500 + index),
              groupId,
              inviterUserId: adminUserId,
              inviteeUserId: guest.id,
              status: "ACCEPTED",
              createdAt: date,
              updatedAt: date,
            })),
            createdAt: date,
            updatedAt: date,
          },
        },
      });
    });
    await page.route("**/api/matches?*", (route) =>
      route.fulfill({
        json: {
          matches: guests.map((_, index) => ({
            id: uuid(600 + index),
            adminUserId,
            name: `Match ${index + 1}`,
            dates: [date],
            minPlayers: 2,
            maxPlayers: 3,
            gameIds: [game.id],
            locations: [locations[0]],
            status: "PLANNING",
            invitations: [],
            createdAt: date,
            updatedAt: date,
          })),
          nextCursor: null,
        },
      }),
    );
    await page.route("**/api/groups?*", (route) =>
      route.fulfill({
        json: {
          groups: guests.map((_, index) => ({
            id: uuid(700 + index),
            adminUserId,
            name: `Group ${index + 1}`,
            isPublic: false,
            memberCount: 1,
            memberProfiles: [admin],
            invitations: [],
            createdAt: date,
            updatedAt: date,
          })),
          nextCursor: null,
        },
      }),
    );

    await page.goto("/matches");
    await assertScrollableEnd(
      page,
      page.getByRole("link", { name: "Open match: Match 14" }),
      "Create a match",
    );
    await page.goto("/groups");
    await assertScrollableEnd(
      page,
      page.getByRole("link", { name: "Open group: Group 14" }),
      "Create group",
    );
    await page.goto(`/matches/${matchId}`);
    await assertScrollableEnd(
      page,
      page.getByText("Cafe 14", { exact: true }).locator("xpath=ancestor::li[1]"),
      "Edit match",
    );
    await page.getByRole("tab", { name: "Players", exact: true }).click();
    await assertScrollableEnd(
      page,
      page.getByText("Guest 14", { exact: true }).locator("xpath=ancestor::li[1]"),
      "Edit match",
    );
    await page.getByRole("tab", { name: "Leaderboards", exact: true }).click();
    await page.getByRole("button", { name: "Board game" }).click();
    await page.getByRole("option", { name: "Cascadia", exact: true }).click();
    await assertScrollableEnd(
      page,
      page.getByText("Guest 14", { exact: true }).locator("xpath=ancestor::tr[1]"),
      "Edit match",
    );
    terminated = true;
    await page.reload();
    await page.getByRole("tab", { name: "Results", exact: true }).click();
    await assertScrollableEnd(
      page,
      page.getByText("Guest 14", { exact: true }).locator("xpath=ancestor::li[1]"),
    );
    await page.goto(`/groups/${groupId}`);
    await assertScrollableEnd(
      page,
      page.getByText("No invitations", { exact: true }),
      "Edit group",
    );
    await page.getByRole("tab", { name: "Leaderboards", exact: true }).click();
    await page.getByRole("button", { name: "Board game" }).click();
    await page.getByRole("option", { name: "Cascadia", exact: true }).click();
    await assertScrollableEnd(
      page,
      page.getByText("Guest 14", { exact: true }).locator("xpath=ancestor::tr[1]"),
    );
  });
}

test("current location fills a verified address, handles failure and keeps confirmation explicit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await signIn(page);
  await page.context().grantPermissions(["geolocation"], { origin: new URL(page.url()).origin });
  await page.context().setGeolocation({ longitude: 12.5, latitude: 41.9 });
  let fail = false;
  const queries: string[] = [];
  await page.route("**/api/locations/search?*", (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("query") ?? "");
    return fail
      ? route.fulfill({ status: 502, json: { error: "Geocoding unavailable" } })
      : route.fulfill({
          json: {
            items: [
              {
                id: "address.gps",
                address: "Verified GPS address, Rome, Italy",
                longitude: 12.5,
                latitude: 41.9,
              },
            ],
          },
        });
  });
  await page.goto("/matches");
  await page.getByRole("button", { name: "Create a match" }).click();
  await page.getByRole("textbox", { name: "Match name" }).fill("Current position game");
  await page.locator('input[type="datetime-local"]').first().fill("2026-11-01T20:00");
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Select location" }).click();
  await page.getByRole("textbox", { name: "Location name" }).fill("GPS cafe");
  fail = true;
  await page.getByRole("button", { name: "Center map on my location" }).click();
  await expect(page.getByText("Could not search addresses")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm location" })).toBeDisabled();
  fail = false;
  await page.getByRole("button", { name: "Center map on my location" }).click();
  await expect(page.getByRole("searchbox", { name: "Search address" })).toHaveValue(
    "Verified GPS address, Rome, Italy",
  );
  expect(queries).toEqual(["12.5000000,41.9000000", "12.5000000,41.9000000"]);
  await expect(page.getByRole("button", { name: "Confirm location" })).toBeEnabled();
  await page.getByRole("button", { name: "Confirm location" }).click();
  await expect(page.getByText("GPS cafe", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Locations", exact: true })).toBeVisible();
});
