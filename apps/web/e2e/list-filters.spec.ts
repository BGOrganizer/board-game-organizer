import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

const E2E_EMAIL = process.env.E2E_EMAIL ?? "";

async function signIn(page: import("@playwright/test").Page) {
  if (!E2E_EMAIL) throw new Error("E2E_EMAIL required for list filters E2E");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.user?.id));
  return page.evaluate(() => Reflect.get(window, "Clerk")?.user?.id as string);
}

test("match and group lists search names, union roles and load more on scroll", async ({
  page,
}) => {
  const userId = await signIn(page);
  for (const kind of ["matches", "groups"] as const) {
    const rows = Array.from({ length: 23 }, (_, index) => {
      const role = (["admin", "invited", "accepted"] as const)[index % 3];
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const base = {
        id,
        name: `Catan ${index + 1}`,
        adminUserId: role === "admin" ? userId : "someone-else",
        createdAt: new Date(Date.UTC(2026, 9, 1) - index * 60_000).toISOString(),
        updatedAt: "2026-10-01T00:00:00.000Z",
        invitations:
          role === "admin"
            ? []
            : [
                {
                  id,
                  inviteeUserId: userId,
                  inviterUserId: "someone-else",
                  status: role === "invited" ? "PENDING" : "ACCEPTED",
                  createdAt: "2026-10-01T00:00:00.000Z",
                  updatedAt: "2026-10-01T00:00:00.000Z",
                },
              ],
      };
      return kind === "groups"
        ? { ...base, isPublic: false, memberCount: role === "accepted" ? 2 : 1, memberProfiles: [] }
        : {
            ...base,
            status: "PLANNING",
            dates: ["2026-10-01T20:00:00.000Z"],
            minPlayers: 2,
            maxPlayers: 4,
            gameIds: [1],
            invitedUserIds: role === "admin" ? [] : [userId],
          };
    });
    await page.route(`**/api/${kind}?**`, (route) => {
      const params = new URL(route.request().url()).searchParams;
      const selectedRoles = params.get("roles")?.split(",") ?? ["admin", "invited", "accepted"];
      const query = params.get("query")?.toLowerCase() ?? "";
      const filtered = rows.filter(
        (row, index) =>
          selectedRoles.includes((["admin", "invited", "accepted"] as const)[index % 3]) &&
          row.name.toLowerCase().includes(query),
      );
      const start = params.has("cursor")
        ? filtered.findIndex((row) => `${row.createdAt}|${row.id}` === params.get("cursor")) + 1
        : 0;
      const size = Number(params.get("limit") ?? 20);
      const items = filtered.slice(start, start + size);
      const last = items.at(-1);
      return route.fulfill({
        json: {
          [kind]: items,
          nextCursor:
            start + size < filtered.length && last ? `${last.createdAt}|${last.id}` : null,
        },
      });
    });
    await page.goto(`/${kind}`);
    const label = kind === "matches" ? "Search matches" : "Search groups";
    const empty =
      kind === "matches" ? "No matches match your filters" : "No groups match your filters";
    for (const role of ["Admin", "Invited", "Accepted"])
      await expect(page.getByRole("button", { name: role, exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    await page.getByText("Catan 20", { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText("Catan 23", { exact: true })).toBeVisible();
    await page.getByRole("searchbox", { name: label }).fill("Catan 2");
    await expect(page.getByText("Catan 22", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Admin", exact: true }).click();
    await expect(page.getByText("Catan 22", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Catan 23", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Invited", exact: true }).click();
    await page.getByRole("button", { name: "Accepted", exact: true }).click();
    await expect(page.getByText(empty)).toBeVisible();
    await page.unroute(`**/api/${kind}?**`);
  }
});
