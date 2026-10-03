import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
const id = "1f454adb-43e3-47ad-8c29-57b97a55a211";
const now = "2026-10-01T20:00:00.000Z";

async function signIn(page: import("@playwright/test").Page) {
  if (!E2E_EMAIL) throw new Error("E2E_EMAIL required group E2E");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.user?.id));
  return page.evaluate(() => Reflect.get(window, "Clerk")?.user?.id as string);
}

test("group and match lifecycle notifications appear in inbox", async ({ page }) => {
  await signIn(page);
  const destinationId = "d594128f-4fb6-495e-97a6-87b2ce4ad8f0";
  const titles = [
    ["group_invitation", "New group invitation", `/groups/${destinationId}`],
    ["group_invitation_accepted", "Group invitation accepted", `/groups/${destinationId}`],
    ["match_created", "Match confirmed", `/matches/${destinationId}`],
    ["match_terminated", "Match finished", `/matches/${destinationId}`],
  ] as const;
  const deleted = new Set<string>();
  await page.route("**/api/notifications?**", (route) =>
    route.fulfill({
      json: {
        notifications: titles.flatMap(([kind, title, href], index) => {
          const id = `00000000000000000000000${index}`;
          return deleted.has(id)
            ? []
            : [
                {
                  id,
                  kind,
                  title,
                  description: `${title} description`,
                  href,
                  readAt: null,
                  createdAt: now,
                },
              ];
        }),
        unreadCount: titles.length - deleted.size,
        nextCursor: null,
      },
    }),
  );
  await page.route("**/api/notifications/*", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deleted.add(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
    return route.fulfill({ json: { success: true } });
  });
  await page.goto("/notifications");
  for (const [, title, href] of titles)
    await expect(
      page.getByText(title, { exact: true }).locator("xpath=ancestor::a"),
    ).toHaveAttribute("href", href);
  await expect(
    page.getByText("Match finished", { exact: true }).locator("xpath=ancestor::a").locator("svg"),
  ).toHaveClass(/lucide-trophy/);
  await page.getByRole("button", { name: "Notifications" }).click();
  const dropdown = page.locator('[data-slot="dropdown-popover"]');
  await expect(dropdown.getByText("Match confirmed", { exact: true })).toBeVisible();
  await expect(dropdown.getByText("Match finished", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dropdown).toHaveCount(0);
  await page.getByText("Match confirmed", { exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/matches/${destinationId}$`));
  await page.goto("/notifications");
  await page.getByText("Group invitation accepted", { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${destinationId}$`));
  await page.goto("/notifications");
  await page
    .getByText("New group invitation", { exact: true })
    .locator("xpath=ancestor::article")
    .getByRole("button", { name: "Delete notification" })
    .click();
  await page
    .getByRole("dialog", { name: "Delete notification?" })
    .getByRole("button", { name: "Delete notification" })
    .click();
  await expect(page.getByText("New group invitation", { exact: true })).toHaveCount(0);
  expect(deleted).toContain("000000000000000000000000");
});

test("notification inbox loads later pages on scroll", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/notifications?**", (route) => {
    const url = new URL(route.request().url());
    const start = url.searchParams.has("cursor") ? 20 : 0;
    return route.fulfill({
      json: {
        notifications: Array.from({ length: start ? 3 : 20 }, (_, index) => ({
          id: (start + index + 1).toString(16).padStart(24, "0"),
          kind: "friend_request",
          title: `Notification ${start + index + 1}`,
          description: "Test notification",
          href: "/contacts",
          readAt: null,
          createdAt: now,
        })),
        unreadCount: 23,
        nextCursor: start ? null : (20).toString(16).padStart(24, "0"),
      },
    });
  });
  await page.goto("/notifications");
  await expect(page.getByText("Notification 20", { exact: true })).toBeVisible();
  await page.getByText("Notification 20", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText("Notification 23", { exact: true })).toBeVisible();
});

test("groups: empty, create, edit, archive and failed request", async ({ page }) => {
  const adminUserId = await signIn(page);
  let current: Record<string, unknown> | null = null;
  let failUpdate = false;
  await page.route("**/api/relationships?type=friends**", (route) =>
    route.fulfill({
      json: [
        {
          fromUserId: adminUserId,
          toUserId: "user_friend",
          profile: {
            id: "user_friend",
            name: "E2E Friend",
            email: "friend@example.test",
            avatarUrl: null,
            presence: { online: false, lastActiveAt: now },
          },
        },
      ],
    }),
  );
  await page.route("**/api/group-invitations/**", (route) => {
    if (route.request().method() !== "DELETE" || !current) return route.fulfill({ status: 404 });
    current = { ...current, invitations: [] };
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/groups**", async (route) => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/groups" && method === "GET")
      return route.fulfill({ json: { groups: current ? [current] : [] } });
    if (method === "POST" || method === "PATCH") {
      if (failUpdate && method === "PATCH")
        return route.fulfill({ status: 500, json: { error: "failed" } });
      const input = route.request().postDataJSON();
      current = {
        id,
        adminUserId,
        name: input.name,
        isPublic: input.isPublic,
        memberCount: 1,
        memberProfiles: [{ id: adminUserId, name: "E2E Test", email: null, avatarUrl: null }],
        invitations: input.invitedUserIds.map((userId: string) => ({
          id: "b40e695e-ad90-4730-85f3-a8ddb581c49b",
          groupId: id,
          inviteeUserId: userId,
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        })),
        createdAt: now,
        updatedAt: now,
      };
      return route.fulfill({ json: { group: current } });
    }
    if (method === "DELETE") {
      current = null;
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto("/groups");
  await expect(page.getByText("No groups yet")).toBeVisible();
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/groups\/new$/);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await page.getByRole("button", { name: "Create group" }).click();
  await page.getByLabel("Group name").fill("Saturday Players");
  await page.getByText("Public group", { exact: true }).click();
  await expect(page.getByRole("switch", { name: "Public group" })).toBeChecked();
  await page.getByRole("button", { name: "Remove invite" }).click();
  await expect(page.getByRole("button", { name: "Select a friend" })).toHaveCount(1);
  await page.getByRole("button", { name: "Add friend" }).click();
  await page.getByRole("button", { name: "Remove invite" }).first().click();
  await expect(page.getByRole("button", { name: "Select a friend" })).toHaveCount(1);
  await page.getByRole("button", { name: "Select a friend" }).click();
  await expect(page.getByText("E2E Friend")).toBeVisible();
  await page.getByRole("button", { name: "Add: E2E Friend" }).click();
  await page.getByRole("button", { name: "Remove invite" }).click();
  await expect(page.getByRole("button", { name: "Select a friend" })).toHaveCount(1);
  await page.getByRole("button", { name: "Select a friend" }).click();
  await page.getByRole("button", { name: "Add: E2E Friend" }).click();
  await expect(page.getByText("E2E Friend")).toBeVisible();
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByText("Saturday Players")).toBeVisible();
  await expect(page.getByText("Public", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Group admin")).toBeVisible();
  await page.getByRole("link", { name: "Open group: Saturday Players" }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}$`));
  await expect(page.getByRole("button", { name: "Remove from group: E2E Friend" })).toBeVisible();
  await page.getByRole("button", { name: "Edit group" }).click();
  await expect(page).toHaveURL(new RegExp(`/groups/${id}/edit$`));
  await page.getByLabel("Group name").fill("Updated Players");
  await page.getByText("Public group", { exact: true }).click();
  await expect(page.getByRole("switch", { name: "Public group" })).not.toBeChecked();
  failUpdate = true;
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Could not update group")).toBeVisible();
  failUpdate = false;
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Updated Players")).toBeVisible();
  await expect(page.getByText(/^Private · 1 member$/)).toBeVisible();
  await page.getByRole("button", { name: "Remove from group: E2E Friend" }).click();
  const removeDialog = page.getByRole("dialog", { name: "Remove from group?" });
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByRole("button", { name: "Remove from group" }).click();
  await expect(page.getByText("Person removed from group")).toBeVisible();
  await page.getByRole("button", { name: "More group actions" }).click();
  await page.getByRole("button", { name: "Delete group" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete group?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete group" }).click();
  await expect(page.getByText("No groups yet")).toBeVisible();
});

test("pending group invitation shows admin, then accepted members", async ({ page }) => {
  const inviteeUserId = await signIn(page);
  const invitation = {
    id: "b40e695e-ad90-4730-85f3-a8ddb581c49b",
    groupId: id,
    inviteeUserId,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };
  let group = {
    id,
    adminUserId: "user_host",
    name: "Board Gamers",
    isPublic: false,
    memberCount: 1,
    memberProfiles: [{ id: "user_host", name: "Group Host", email: null, avatarUrl: null }],
    invitations: [invitation],
    createdAt: now,
    updatedAt: now,
  };
  await page.route("**/api/groups**", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith(`/groups/${id}`)
        ? { group }
        : { groups: [group] },
    }),
  );
  await page.route("**/api/group-invitations/**", (route) => {
    group = {
      ...group,
      memberCount: 2,
      invitations: [{ ...invitation, status: "ACCEPTED" }],
      memberProfiles: [
        { id: "user_host", name: "Group Host", email: null, avatarUrl: null },
        { id: inviteeUserId, name: "Group Guest", email: null, avatarUrl: null },
      ],
    };
    return route.fulfill({ json: { group } });
  });
  await page.goto("/groups");
  await page.getByRole("link", { name: "Open group: Board Gamers" }).click();
  await expect(page.getByText("Group Host")).toBeVisible();
  await expect(page.getByText("Group Guest")).toHaveCount(0);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByText("Group Host")).toBeVisible();
  await expect(page.getByText("Group Guest")).toBeVisible();
  await expect(page.getByLabel("Group admin")).toBeVisible();
});

test("match wizard selects optional group and picks an accepted non-friend member", async ({
  page,
}) => {
  const adminUserId = await signIn(page);
  await page.route("**/api/groups**", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id,
            adminUserId,
            name: "Tabletop Club",
            isPublic: false,
            memberCount: 2,
            invitations: [
              {
                id: "dcdff067-811b-44eb-94bc-0186dd23ce1f",
                groupId: id,
                inviteeUserId: "nonfriend",
                status: "ACCEPTED",
                createdAt: now,
                updatedAt: now,
              },
            ],
            memberProfiles: [
              { id: adminUserId, name: "Admin", email: null, avatarUrl: null },
              { id: "nonfriend", name: "Group Guest", email: null, avatarUrl: null },
            ],
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    }),
  );
  await page.route("**/api/matches**", (route) => route.fulfill({ json: { matches: [] } }));
  await page.goto("/matches");
  await page.getByRole("button", { name: "Create a match" }).click();
  await page.getByLabel("Match name").fill("Group Games Night");
  await page.getByRole("button", { name: /Group \(optional\)/ }).click();
  await page.getByRole("option", { name: "Tabletop Club" }).click();
  await page.locator('input[type="datetime-local"]').first().fill("2026-10-01T20:00");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByText("Invite group members")).toBeVisible();
  await page
    .getByRole("button", { name: /Select group member/ })
    .first()
    .click();
  await expect(page.getByText("Group Guest")).toBeVisible();
  await page.getByRole("button", { name: "Add: Group Guest" }).click();
  await expect(page.getByText("Group Guest")).toBeVisible();
});

test("group invitations: accept, decline and leave with confirmation", async ({ page }) => {
  const userId = await signIn(page);
  const secondId = "2c7a2b3c-4291-4b01-957a-e2af92262c55";
  const invitations = [id, secondId].map((groupId) => ({
    id: groupId,
    groupId,
    inviteeUserId: userId,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  }));
  await page.route("**/api/group-invitations/**", (route) => {
    const invitation = invitations.find((item) => route.request().url().includes(item.id));
    if (!invitation) return route.fulfill({ status: 404 });
    invitation.status =
      route.request().postDataJSON().decision === "accept" ? "ACCEPTED" : "DECLINED";
    return route.fulfill({ json: { group: null } });
  });
  await page.route("**/api/groups**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "DELETE" && path.endsWith("/membership")) {
      invitations.splice(
        invitations.findIndex((item) => path.includes(item.groupId)),
        1,
      );
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({
      json: {
        groups: invitations
          .filter((item) => item.status !== "DECLINED")
          .map((invitation) => ({
            id: invitation.groupId,
            adminUserId: "another_user",
            name: invitation.groupId === id ? "First Club" : "Second Club",
            isPublic: false,
            memberCount: invitation.status === "ACCEPTED" ? 2 : 1,
            memberProfiles:
              invitation.status === "ACCEPTED"
                ? [{ id: userId, name: "E2E Test", email: null, avatarUrl: null }]
                : [],
            invitations: [invitation],
            createdAt: now,
            updatedAt: now,
          })),
      },
    });
  });
  await page.goto("/groups");
  await expect(page.getByText("First Club")).toBeVisible();
  await page.getByRole("button", { name: "Accept group invitation" }).first().click();
  await expect(page.getByText("2 members")).toBeVisible();
  await page.getByRole("button", { name: "Decline group invitation" }).click();
  await expect(page.getByText("Second Club")).toBeHidden();
  await page.getByRole("link", { name: "Open group: First Club" }).click();
  await expect(page.getByRole("button", { name: "Leave group" })).toBeVisible();
  await page.getByRole("button", { name: "Leave group" }).click();
  await page
    .getByRole("dialog", { name: "Leave group?" })
    .getByRole("button", { name: "Leave group" })
    .click();
  await expect(page.getByText("No groups yet")).toBeVisible();
  await expect(page.getByText("Could not load group details")).not.toBeVisible();
});
