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
  context,
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
    for (const role of roles) await expect(filter(role, true)).toHaveCount(0);
    const filterInput = activePanel().getByRole("searchbox", { name: "Filter", exact: true });
    await expect(
      activePanel().getByRole("button", { name: "Sort by Date", exact: true }),
    ).toBeVisible();
    await filterInput.focus();
    await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveCount(0);
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
    await activePanel().getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("tab", { name: tab, selected: true })).toBeVisible();
    for (const role of roles) await expect(filter(role, true)).toHaveCount(0);
    await expect(
      activePanel().getByRole("button", { name: "Sort by Date", exact: true }),
    ).toBeVisible();
  }

  await page.getByRole("tab", { name: "Search", exact: true }).click();
  for (const role of roles) await expect(filter(role, true)).toHaveCount(0);
  await expect(activePanel().getByRole("button", { name: /^Sort by / })).toHaveCount(0);
  const search = activePanel().getByRole("searchbox", { name: "Search groups", exact: true });
  const friends = activePanel().getByRole("button", { name: "Friends", exact: true });
  const nearby = activePanel().getByRole("button", { name: "Near me", exact: true });
  await expect(friends).toHaveCount(0);
  await expect(nearby).toHaveCount(0);
  await search.focus();
  await expect(friends).toHaveAttribute("aria-pressed", "true");
  await expect(nearby).toHaveAttribute("aria-pressed", "false");
  const discoveryResponse = page.waitForResponse((response) => {
    const { pathname, searchParams } = new URL(response.url());
    return (
      pathname === "/api/groups" &&
      searchParams.get("scope") === "public" &&
      searchParams.get("query") === "l"
    );
  });
  await search.fill("l");
  const searchParams = new URL((await discoveryResponse).url()).searchParams;
  expect(searchParams.get("friends")).toBe("true");
  for (const key of ["roles", "type", "sort", "direction"])
    expect(searchParams.has(key)).toBe(false);
  await expect(page.getByRole("tab", { name: "Search", exact: true })).toHaveCount(0);
  await expect(activePanel().getByRole("heading", { name: "Group search" })).toHaveCount(0);
  await expect(
    activePanel().getByRole("link", { name: "Open group: Alpha Invitation Club" }),
  ).toBeVisible();
  await activePanel().getByRole("button", { name: "Back", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("tab", { name: "Search", selected: true })).toBeVisible();

  await context.grantPermissions(["geolocation"], { origin: new URL(page.url()).origin });
  await context.setGeolocation({ latitude: 41.9, longitude: 12.5 });
  await expect(friends).toHaveCount(0);
  await expect(nearby).toHaveCount(0);
  await search.focus();
  const waitForRadius = (radius: string | null) =>
    page.waitForResponse((response) => {
      const { pathname, searchParams } = new URL(response.url());
      return (
        pathname === "/api/groups" &&
        searchParams.get("scope") === "public" &&
        searchParams.get("friends") === "true" &&
        searchParams.get("radiusKm") === radius &&
        searchParams.has("nearLat") === Boolean(radius)
      );
    });
  const initialRadius = waitForRadius("25");
  await nearby.click();
  await initialRadius;
  const menu = page.getByRole("dialog", { name: "Distance" });
  await activePanel().getByRole("button", { name: "Distance, 25 km" }).click();
  await expect(menu.getByRole("button", { name: "25 km", pressed: true })).toBeVisible();
  const preset = waitForRadius("50");
  await menu.getByRole("button", { name: "50 km" }).click();
  await preset;
  await expect(menu).toBeHidden();
  await activePanel().getByRole("button", { name: "Distance, 50 km" }).click();
  await expect(menu.getByRole("button")).toHaveText(["5 km", "10 km", "25 km", "50 km", "100 km"]);
  const maximum = waitForRadius("100");
  await menu.getByRole("button", { name: "100 km" }).click();
  await maximum;
  await nearby.click();
  await expect(activePanel().getByRole("button", { name: /^Distance,/ })).toHaveCount(0);
  await nearby.click();
  await expect(activePanel().getByRole("button", { name: "Distance, 100 km" })).toBeVisible();
});
