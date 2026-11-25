import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { groupRecord } from "../src/test-fixtures/eventRecords";
import { completeMobileNumberIfNeeded } from "./mobile-number";

const fixtures = [
  { name: "Zebra Admin Club", role: "admin", filter: "administrator" },
  { name: "Orchid Moderator Club", role: "moderator", filter: "moderator" },
  { name: "Maple Member Club", role: "accepted", filter: "member" },
  { name: "Alpha Invitation Club", role: "invited", filter: "pending" },
  { name: "Beta Request Club", role: "requested", filter: "pending" },
] as const;

test.use({ locale: "en-US" });

test("owned Groups combine role filters with Name and Date ordering in both tabs", async ({
  page,
}) => {
  const email = process.env.E2E_EMAIL;
  if (!email) throw new Error("E2E_EMAIL required for Group list filters");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.user?.id));
  const userId = await page.evaluate(() => Reflect.get(window, "Clerk")?.user?.id as string);

  await page.route("**/api/groups?**", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const query = new URL(route.request().url()).searchParams;
    const discovery = query.get("scope") === "public";
    const type = discovery ? "PUBLIC" : query.get("type") === "PUBLIC" ? "PUBLIC" : "PRIVATE";
    const selected = query.get("roles")?.split(",");
    const name = query.get("query")?.toLowerCase() ?? "";
    const direction = query.get("direction") === "asc" ? 1 : -1;
    const items = fixtures
      .flatMap(({ name: groupName, role, filter }, index): GroupRecordResponse[] => {
        if (
          (role === "requested" && type === "PRIVATE") ||
          (selected && !selected.includes(filter)) ||
          !groupName.toLowerCase().includes(name)
        )
          return [];
        const id = `00000000-0000-4000-8000-${type === "PUBLIC" ? "1" : "0"}${String(index + 1).padStart(11, "0")}`;
        const createdAt = new Date(Date.UTC(2026, 9, index + 1)).toISOString();
        const pending = filter === "pending";
        const manager = role === "admin" || role === "moderator";
        return [
          {
            ...groupRecord,
            id,
            name: groupName,
            approved: { name: groupName },
            type,
            role,
            adminUserId: role === "admin" ? userId : "user-other",
            createdAt,
            updatedAt: createdAt,
            eventCount: pending ? null : 0,
            canViewEvents: !pending,
            canViewRankings: !pending,
            canSocialInteract: !pending,
            canInvite: manager,
            canEdit: manager,
            myMembership:
              role === "admin"
                ? null
                : {
                    id,
                    groupId: id,
                    userId,
                    role: role === "moderator" ? "MODERATOR" : undefined,
                    kind: role === "requested" ? "REQUEST" : "INVITATION",
                    status: pending ? "PENDING" : "ACCEPTED",
                    version: 1,
                    createdAt,
                    updatedAt: createdAt,
                  },
          },
        ];
      })
      .sort(
        (a, b) =>
          direction *
          (query.get("sort") === "name"
            ? a.name.localeCompare(b.name)
            : a.createdAt.localeCompare(b.createdAt)),
      );
    return route.fulfill({ json: { items, nextCursor: null } });
  });

  await page.goto("/groups");
  const roles = ["Admin", "Moderator", "Member", "Pending"] as const;
  const activePanel = () => page.getByRole("tabpanel");
  const filter = (name: (typeof roles)[number], pressed: boolean) =>
    activePanel().getByRole("button", { name, exact: true, pressed });
  const firstGroup = () =>
    activePanel()
      .getByRole("link", { name: /^Open group:/ })
      .first();

  for (const tab of ["Private groups", "Public groups"] as const) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    for (const role of roles) await expect(filter(role, true)).toBeVisible();
    await expect(firstGroup()).toHaveAccessibleName(
      tab === "Public groups"
        ? "Open group: Beta Request Club"
        : "Open group: Alpha Invitation Club",
    );

    await activePanel().getByRole("button", { name: "Sort by Date", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Name", exact: true }).click();
    await expect(firstGroup()).toHaveAccessibleName("Open group: Zebra Admin Club");
    await activePanel().getByRole("button", { name: "Sort ascending", exact: true }).click();
    await expect(firstGroup()).toHaveAccessibleName("Open group: Alpha Invitation Club");
    await activePanel().getByRole("button", { name: "Sort by Name", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Date", exact: true }).click();
    await expect(firstGroup()).toHaveAccessibleName("Open group: Zebra Admin Club");

    for (const role of ["Admin", "Moderator", "Member"] as const) await filter(role, true).click();
    await expect(activePanel().getByRole("link", { name: /^Open group:/ })).toHaveCount(
      tab === "Public groups" ? 2 : 1,
    );
    await expect(firstGroup()).toHaveAccessibleName("Open group: Alpha Invitation Club");
    await expect(
      activePanel().getByRole("link", { name: "Open group: Beta Request Club" }),
    ).toHaveCount(tab === "Public groups" ? 1 : 0);
    await filter("Pending", true).click();
    await expect(activePanel().getByText("No groups found", { exact: true })).toBeVisible();
  }

  await page.getByRole("tab", { name: "Search", exact: true }).click();
  for (const role of roles) await expect(filter(role, true)).toHaveCount(0);
  await expect(activePanel().getByRole("button", { name: /^Sort by / })).toHaveCount(0);
  const search = activePanel().getByRole("searchbox", { name: "Search groups", exact: true });
  await search.fill("Alp");
  await expect(
    activePanel().getByText("Enter at least 4 characters to search", { exact: true }),
  ).toBeVisible();
  const discoveryResponse = page.waitForResponse((response) => {
    const { pathname, searchParams } = new URL(response.url());
    return (
      pathname === "/api/groups" &&
      searchParams.get("scope") === "public" &&
      searchParams.get("query") === "Alpha"
    );
  });
  await search.fill("Alpha");
  const searchParams = new URL((await discoveryResponse).url()).searchParams;
  for (const key of ["roles", "type", "sort", "direction"])
    expect(searchParams.has(key)).toBe(false);
  await expect(firstGroup()).toHaveAccessibleName("Open group: Alpha Invitation Club");
});
