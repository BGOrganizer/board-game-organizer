import type {
  EventResponse,
  EventTableResponse,
  OrganizationMemberResponse,
  OrganizationMembership,
  OrganizationResponse,
} from "@board-game-organizer/schemas";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

const orgId = "11111111-1111-4111-8111-111111111111",
  eventId = "22222222-2222-4222-8222-222222222222",
  tableId = "33333333-3333-4333-8333-333333333333",
  assetId = "44444444-4444-4444-8444-444444444444";
const now = "2030-06-01T12:00:00.000Z";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=",
  "base64",
);
const logo = `data:image/png;base64,${png.toString("base64")}`;
const location = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Community club",
  address: "Via Roma 1, Rome, Italy",
  longitude: 12.5,
  latitude: 41.9,
};
const baseOrganization: OrganizationResponse = {
  id: orgId,
  adminUserId: "viewer",
  name: "Community club",
  location,
  logoAssetId: assetId,
  logo,
  status: "CREATED",
  role: "admin",
  memberCount: 1,
  publishedEventCount: 2,
  myMembership: null,
  approved: { name: "Community club", logoAssetId: assetId, location },
  version: 4,
  createdAt: now,
  updatedAt: now,
};
const baseEvent: EventResponse = {
  id: eventId,
  organizationId: orgId,
  adminUserId: "viewer",
  name: "Summer games evening",
  organizationName: baseOrganization.name,
  logo,
  location,
  timeZone: "UTC",
  startsAt: "2030-06-12T14:00:12.000Z",
  endsAt: "2030-06-12T18:00:34.000Z",
  bookingClosesAt: "2030-06-11T14:00:56.000Z",
  status: "PUBLISHED",
  role: "admin",
  canModify: true,
  canPublish: true,
  tableCount: 20,
  organizationApproved: true,
  confirmedParticipantCount: 3,
  version: 7,
  createdAt: now,
  updatedAt: now,
};
const baseTable: EventTableResponse = {
  id: tableId,
  eventId,
  name: "Azul table",
  gameId: 1,
  gameName: "Azul",
  image: null,
  startsAt: "2030-06-12T14:01:12.000Z",
  endsAt: "2030-06-12T17:59:34.000Z",
  minPlayers: 2,
  maxPlayers: 4,
  openSkill: false,
  status: "PLANNING",
  confirmedCount: 0,
  reservedCount: 0,
  myBooking: null,
  canBook: true,
  demonstrator: null,
  demonstratorUserId: undefined,
  createdAt: now,
  updatedAt: now,
};
async function expectButtonsOnOneRow(buttons: Locator) {
  await expect
    .poll(() =>
      buttons.evaluateAll((elements) => {
        const boxes = elements.map((element) => element.getBoundingClientRect());
        return (
          boxes.length > 0 &&
          boxes.every(
            (box) =>
              Math.abs(box.top - boxes[0].top) < 1 &&
              box.width >= 44 &&
              box.height >= 44 &&
              box.left >= 0 &&
              box.right <= window.innerWidth,
          )
        );
      }),
    )
    .toBe(true);
}
async function fixture(page: Page) {
  let viewer = "viewer",
    organization = { ...baseOrganization },
    event = { ...baseEvent },
    table = { ...baseTable };
  let failSave = false,
    moderator = false,
    denyReview = false;
  const members: OrganizationMemberResponse[] = [];
  const membership = (
    userId: string,
    kind: OrganizationMembership["kind"],
    status: OrganizationMembership["status"],
  ): OrganizationMembership => ({
    id: "88888888-8888-4888-8888-888888888888",
    organizationId: orgId,
    userId,
    kind,
    status,
    createdAt: now,
    updatedAt: now,
  });
  const writes: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      method = req.method();
    if (method === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization,content-type",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        },
      });
    if (method !== "GET") {
      const body = req.postData() ? req.postDataJSON() : {};
      writes.push({ method, path, body });
      if (path === "/api/organization-assets")
        return route.fulfill({ json: { id: assetId, receivedBytes: 0 } });
      if (path.endsWith("/complete"))
        return route.fulfill({ json: { id: assetId, preview: logo } });
      if (path.startsWith("/api/organization-assets/"))
        return route.fulfill({ json: { id: assetId, receivedBytes: png.length } });
      if (path === `/api/organizations/${orgId}/membership`) {
        organization = {
          ...organization,
          role: "requested",
          myMembership: membership(viewer, "REQUEST", "PENDING"),
        };
        return route.fulfill({ json: organization.myMembership });
      }
      if (path.startsWith(`/api/organizations/${orgId}/members/`)) {
        const userId = path.split("/").at(-1)!;
        const action = body.action;
        const person = members.find((row) => row.userId === userId);
        const status =
          action === "approve" || action === "accept"
            ? "ACCEPTED"
            : action === "ban"
              ? "EXCLUDED"
              : action === "decline"
                ? "DECLINED"
                : "LEFT";
        const row = membership(userId, person?.membership?.kind ?? "INVITATION", status);
        if (person) person.membership = row;
        if (userId === viewer)
          organization = {
            ...organization,
            role: action === "accept" ? "accepted" : "none",
            myMembership: row,
          };
        return route.fulfill({ json: row });
      }
      if (path === `/api/organizations/${orgId}/review`) {
        if (denyReview)
          return route.fulfill({ status: 403, json: { error: "MODERATOR_REQUIRED" } });
        organization = {
          ...organization,
          version: organization.version + 1,
          ...(body.decision === "approve"
            ? {
                status: "CREATED",
                approved: organization.proposal,
                reviewStatus: undefined,
                proposal: undefined,
              }
            : { reviewStatus: "REJECTED", rejectionReason: String(body.reason) }),
        };
        return route.fulfill({ json: organization });
      }
      if (path === "/api/organizations" || path === `/api/organizations/${orgId}`) {
        if (failSave)
          return route.fulfill({ status: 409, json: { error: "ORGANIZATION_CHANGED" } });
        organization = {
          ...organization,
          ...body,
          adminUserId: viewer,
          version: organization.version + 1,
        };
        if (path === "/api/organizations")
          Object.assign(organization, {
            status: "PENDING",
            reviewStatus: "PENDING",
            approved: undefined,
            proposal: { name: body.name, logoAssetId: body.logoAssetId, location: body.location },
          });
        return route.fulfill({ json: organization });
      }
      if (path === "/api/events" || path === `/api/events/${eventId}`) {
        if (failSave)
          return route.fulfill({ status: 503, json: { error: "DEADLINE_SERVICE_UNAVAILABLE" } });
        event = {
          ...event,
          ...body,
          adminUserId: viewer,
          version: event.version + 1,
          ...(req.method() === "DELETE" ? { status: "CANCELLED" as const, canModify: false } : {}),
        };
        return route.fulfill({ json: event });
      }
      if (path.endsWith("/bookings") || path.startsWith("/api/event-bookings/")) {
        const booking = {
          id: "66666666-6666-4666-8666-666666666666",
          eventId,
          tableId,
          userId: viewer,
          kind: "REQUEST",
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        };
        return route.fulfill({ json: booking });
      }
      return route.fulfill({ json: { success: true } });
    }
    if (path === "/api/profiles")
      return route.fulfill({
        json: {
          data: [
            {
              id: viewer,
              name: "Browser fixture",
              username: "browser_fixture",
              email: "fixture@example.test",
              avatarUrl: null,
              isModerator: moderator,
            },
          ],
        },
      });
    if (path === "/api/organizations") {
      const params = new URL(req.url()).searchParams;
      const mode = params.get("scope");
      const roles = params.get("roles")?.split(",") ?? [
        "admin",
        "invited",
        "accepted",
        "requested",
      ];
      const query = (params.get("query") ?? "").toLowerCase();
      if (mode === "moderation" && denyReview)
        return route.fulfill({ status: 403, json: { error: "MODERATOR_REQUIRED" } });
      return route.fulfill({
        json: {
          items:
            (mode === "moderation" && organization.reviewStatus !== "PENDING") ||
            (mode === "mine" && !roles.includes(organization.role)) ||
            !organization.name.toLowerCase().includes(query)
              ? []
              : [organization],
          nextCursor: null,
        },
      });
    }
    if (path === `/api/organizations/${orgId}/review`) {
      if (denyReview) return route.fulfill({ status: 403, json: { error: "MODERATOR_REQUIRED" } });
      return route.fulfill({ json: { ...organization, ...organization.proposal } });
    }
    if (path === `/api/organizations/${orgId}`) return route.fulfill({ json: organization });
    if (path.endsWith("/members")) {
      const mode = new URL(req.url()).searchParams.get("mode") ?? "accepted";
      if (
        organization.role !== "admin" &&
        (mode !== "accepted" || organization.role !== "accepted")
      )
        return route.fulfill({ status: 403, json: { error: "ORGANIZATION_MEMBER_REQUIRED" } });
      const status = mode === "pending" ? "PENDING" : mode === "excluded" ? "EXCLUDED" : "ACCEPTED";
      return route.fulfill({
        json: {
          items: [
            ...(mode === "accepted"
              ? [
                  {
                    userId: organization.adminUserId,
                    name: "Organization owner",
                    username: "owner_nick",
                    avatarUrl: null,
                    isAdmin: true,
                    membership: null,
                  },
                ]
              : []),
            ...members.filter((person) => person.membership?.status === status),
          ],
          nextCursor: null,
        },
      });
    }
    if (path === "/api/groups/discovery")
      return route.fulfill({
        json: {
          items: "Public games group"
            .toLowerCase()
            .includes((new URL(req.url()).searchParams.get("query") ?? "").toLowerCase())
            ? [
                {
                  id: "77777777-7777-4777-8777-777777777777",
                  name: "Public games group",
                  memberCount: 4,
                  createdAt: now,
                },
              ]
            : [],
          nextCursor: null,
        },
      });
    if (path === `/api/events/${eventId}`) return route.fulfill({ json: event });
    if (path === `/api/events/${eventId}/tables`)
      return route.fulfill({ json: { items: [table], nextCursor: "unloaded-table-cursor" } });
    if (path === `/api/events/${eventId}/tables/${tableId}`) return route.fulfill({ json: table });
    if (path.endsWith("/bookings")) return route.fulfill({ json: { items: [], nextCursor: null } });
    if (path === "/api/events" || path.endsWith("/events")) {
      const params = new URL(req.url()).searchParams;
      const periods = params.get("periods")?.split(",") ?? ["future", "past"];
      const period = Date.parse(event.endsAt) <= Date.now() ? "past" : "future";
      return route.fulfill({
        json: {
          items:
            periods.includes(period) &&
            event.name.toLowerCase().includes((params.get("query") ?? "").toLowerCase())
              ? [event]
              : [],
          nextCursor: null,
        },
      });
    }
    if (path === "/api/locations/search")
      return route.fulfill({
        json: {
          items: [
            {
              id: "geocoding-result",
              address: location.address,
              longitude: location.longitude,
              latitude: location.latitude,
            },
          ],
        },
      });
    if (path === "/api/locations/favorites")
      return route.fulfill({ json: { items: [], nextCursor: null, statuses: [] } });
    if (path === "/api/bgg/picker")
      return route.fulfill({
        json: {
          items: [{ id: 1, name: "Azul", image: null, yearPublished: 2017, source: "CATALOG" }],
          nextCursor: null,
        },
      });
    if (path === "/api/bgg/thing")
      return route.fulfill({ json: { id: 1, name: "Azul", image: null, yearPublished: 2017 } });
    if (path === "/api/bgg/account")
      return route.fulfill({ json: { active: null, pending: null } });
    if (path === "/api/notifications")
      return route.fulfill({ json: { notifications: [], unreadCount: 0, nextCursor: null } });
    if (path === "/api/matches") return route.fulfill({ json: { matches: [], nextCursor: null } });
    if (path === "/api/groups") return route.fulfill({ json: { groups: [], nextCursor: null } });
    if (
      path === "/api/relationships" ||
      path === "/api/users/suggestions" ||
      path === "/api/users/search"
    )
      return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: "UNEXPECTED_FIXTURE_ENDPOINT" } });
  });
  const email = process.env.E2E_EMAIL;
  if (!email) throw Error("E2E_EMAIL required for organizations/events acceptance");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await page.waitForFunction(() => Boolean(Reflect.get(window, "Clerk")?.user?.id));
  viewer = await page.evaluate(() => Reflect.get(window, "Clerk")?.user?.id as string);
  organization.adminUserId = viewer;
  event.adminUserId = viewer;
  return {
    writes,
    viewerId: () => viewer,
    organization: (patch: Partial<OrganizationResponse>) => {
      organization = { ...organization, ...patch };
    },
    review: (denied = false) => {
      moderator = true;
      denyReview = denied;
      organization = {
        ...organization,
        status: "MODIFIED",
        reviewStatus: "PENDING",
        proposal: { ...organization.approved!, name: "Proposed community club" },
      };
    },
    memberRow: (
      status: OrganizationMembership["status"],
      kind: OrganizationMembership["kind"] = "REQUEST",
    ) => {
      members.push({
        userId: "user_target",
        name: "Target Member",
        username: "target_member",
        social: { isFollowing: false, isFollower: false, isFriend: false, blockedByMe: false },
        avatarUrl: null,
        isAdmin: false,
        membership: membership("user_target", kind, status),
      });
    },
    failSave: () => {
      failSave = true;
    },
    succeed: () => {
      failSave = false;
    },
    event: (patch: Partial<EventResponse>) => {
      event = { ...event, ...patch };
    },
    member: () => {
      event = { ...event, role: "member", canModify: false };
    },
    close: () => {
      event = { ...event, canModify: false, closedAt: new Date().toISOString() } as typeof event;
    },
  };
}
async function chooseLocation(page: Page, label = "Choose a verified address") {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("textbox", { name: "Location name" }).fill(location.name);
  await page.getByRole("searchbox", { name: "Search address" }).fill("Via Roma Rome");
  await page.getByRole("button", { name: location.address, exact: true }).click();
  await page.getByRole("button", { name: "Confirm location" }).click();
}

function communityAcceptance() {
  test("event details and tables share cards, keep header cancellation/FAB contextual, and paginate without editing rows", async ({
    page,
  }) => {
    const state = await fixture(page);
    state.event({ tableCount: 2 });
    let failTables = true,
      tableReads = 0;
    await page.route(
      (url) => url.pathname === `/api/events/${eventId}/tables`,
      (route) => {
        tableReads++;
        if (failTables) return route.fulfill({ status: 503, json: { error: "UNAVAILABLE" } });
        const next = new URL(route.request().url()).searchParams.has("cursor");
        return route.fulfill({
          json: {
            items: [
              next
                ? {
                    ...baseTable,
                    id: "33333333-3333-4333-8333-333333333334",
                    name: "Dixit table",
                    gameName: "Dixit",
                  }
                : { ...baseTable, openSkill: true },
            ],
            nextCursor: next ? null : "more",
          },
        });
      },
    );
    await page.goto(`/events/${eventId}`);
    const details = page.getByRole("tabpanel", { name: "Details", exact: true });
    await expect(details.locator('img[src^="data:image/svg+xml,"]')).toBeVisible();
    await expect(details.getByText(baseEvent.organizationName, { exact: true })).toHaveCount(0);
    await expect(details.locator(".lucide-layout-grid")).toHaveCount(0);
    await expect(details.getByText("3", { exact: true })).toBeVisible();
    expect(tableReads).toBe(0);
    const cancel = page.getByRole("button", { name: "Cancel event", exact: true });
    await expect(cancel).toHaveText("");
    await expect(page.locator("header").filter({ has: cancel })).toBeVisible();
    const edit = page.getByRole("link", { name: "Edit event", exact: true });
    await expect(edit).toHaveText("");
    await page.getByRole("tab", { name: "Tables", exact: true }).click();
    await expect(edit).toBeVisible();
    const retry = page.getByRole("button", { name: "Could not load tables. Retry", exact: true });
    await expect(retry).toBeVisible();
    await expect(page.getByText("No tables found", { exact: true })).toHaveCount(0);
    failTables = false;
    await retry.click();
    const table = page.getByRole("link", { name: "Open table: Azul table", exact: true });
    await expect(table).toBeVisible();
    await expect(table.getByRole("img", { name: "Global ratings enabled" })).toBeVisible();
    await expect(table.getByText("2–4", { exact: true })).toBeVisible();
    await expect(table.getByRole("button", { name: /Edit table|Remove table/ })).toHaveCount(0);
    await table.scrollIntoViewIfNeeded();
    const more = page.getByRole("button", { name: "Load more", exact: true });
    if (await more.isVisible()) await more.click();
    await expect(
      page.getByRole("link", { name: "Open table: Dixit table", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Details", exact: true }).click();
    await expect(edit).toBeVisible();
    state.close();
    await page.reload();
    await expect(edit).toHaveCount(0);
    await expect(cancel).toHaveCount(0);
  });
  test("event header cancellation confirms explicitly, survives failure and only navigates on success", async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto(`/events/${eventId}`);
    await page.getByRole("button", { name: "Cancel event", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel event", exact: true });
    await expect(dialog).toBeVisible();
    expect(state.writes).toHaveLength(0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Cancel event", exact: true }).click();
    state.failSave();
    await dialog.getByRole("button", { name: "Cancel event", exact: true }).click();
    await expect
      .poll(() => state.writes.filter((write) => write.method === "DELETE").length)
      .toBe(1);
    await expect(dialog.getByRole("button", { name: "Cancel event", exact: true })).toBeEnabled();
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
    state.succeed();
    await dialog.getByRole("button", { name: "Cancel event", exact: true }).click();
    await expect(page).toHaveURL(/\/events$/);
  });
  test("match table list uses only the event icon below artwork and a crown/event help legend", async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.route(
      (url) => url.pathname === "/api/matches",
      (route) =>
        route.fulfill({
          json: {
            matches: [
              {
                id: "event-match",
                name: "Azul event match",
                adminUserId: state.viewerId(),
                dates: [baseEvent.startsAt],
                locations: [location],
                minPlayers: 2,
                maxPlayers: 4,
                invitedUserIds: [],
                gameIds: [1],
                invitations: [],
                status: "CREATED",
                selectedDate: baseEvent.startsAt,
                selectedGameId: 1,
                selectedGameName: "Azul",
                createdAt: now,
                updatedAt: now,
                eventTable: { eventId, tableId },
              },
            ],
            nextCursor: null,
          },
        }),
    );
    await page.goto("/matches");
    const table = page.getByRole("link", { name: /^Open match: Azul event match, Event table/ });
    await expect(table.getByRole("img", { name: "Administrator", exact: true })).toBeVisible();
    const badge = table.getByRole("img", { name: "Event table", exact: true });
    await expect(badge).toBeVisible();
    await expect(table.getByText("Event table", { exact: true })).toHaveCount(0);
    await expect
      .poll(async () => {
        const icon = await badge.boundingBox(),
          image = await table.locator("img.match-waves").boundingBox();
        return Boolean(icon && image && icon.y >= image.y + image.height - 4);
      })
      .toBe(true);
    await page.getByRole("button", { name: "Table list", exact: true }).click();
    const legend = page.getByRole("dialog");
    await expect(
      legend.getByText("The crown identifies the match administrator.", { exact: true }),
    ).toBeVisible();
    await expect(
      legend.getByText("The calendar identifies a table belonging to an event.", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(legend).toHaveCount(0);
  });
  test("organization events use planets, approved identity, local times, counts and semantic badges", async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto(`/organizations/${orgId}`);
    await page.getByRole("tab", { name: "Events", exact: true }).click();
    const card = page.getByRole("link", { name: /^Open event: Summer games evening/ });
    await expect(card.locator("img")).toHaveAttribute("src", /^data:image\/svg\+xml,/);
    await expect(card.locator(".lucide-badge-check")).toBeVisible();
    await expect(card.getByText("06/12/2030", { exact: true })).toBeVisible();
    await expect(card.getByText("14:00", { exact: true })).toBeVisible();
    await expect(card.getByText("18:00", { exact: true })).toBeVisible();
    await expect(card.getByText("20", { exact: true })).toBeVisible();
    await expect(card.getByText("3", { exact: true })).toBeVisible();
    await expect(card.getByText("Published", { exact: true })).toBeVisible();
    await expect(card.locator(".chip")).toHaveClass(/success/);
    await expect
      .poll(async () => {
        const a = await card.locator("img").boundingBox(),
          n = await card.getByText(baseEvent.name, { exact: true }).boundingBox();
        return Boolean(a && n && a.x + a.width <= n.x);
      })
      .toBe(true);
    state.event({ status: "DRAFT" });
    await page.reload();
    await expect(card.getByText("Draft", { exact: true })).toBeVisible();
    await expect(card.locator(".chip")).toHaveClass(/warning/);
  });
  test("organization details reuse the card and keep destructive self-actions contextual and confirmed", async ({
    page,
  }) => {
    const state = await fixture(page);
    state.organization({ role: "accepted", adminUserId: "another" });
    await page.goto(`/organizations/${orgId}`);
    await expect(page.getByText("Approved members: 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Published events: 2", { exact: true })).toBeVisible();
    const leave = page.getByRole("button", { name: "Leave organization", exact: true });
    await expect(leave).toHaveText("");
    await expect(
      leave.locator("..").getByRole("heading", { name: "Organization details" }),
    ).toBeVisible();
    await leave.click();
    await page
      .getByRole("dialog", { name: "Leave organization", exact: true })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(state.writes).toHaveLength(0);
    state.organization({ role: "requested" });
    await page.reload();
    const cancel = page.getByRole("button", { name: "Cancel request", exact: true });
    await expect(cancel).toHaveText("");
    await cancel.click();
    await page
      .getByRole("dialog", { name: "Cancel request", exact: true })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(state.writes).toHaveLength(0);
  });
  for (const [label, confirm, action] of [
    ["Accept organization invitation", "Accept", "accept"],
    ["Reject organization invitation", "Reject", "decline"],
  ] as const) {
    test(`card invitation choice ${action} confirms only the chosen action`, async ({ page }) => {
      const state = await fixture(page);
      state.organization({ role: "invited", adminUserId: "another" });
      await page.goto(`/organizations/${orgId}`);
      const choice = page.getByRole("button", { name: label, exact: true });
      await expect(choice).toHaveText("");
      await choice.click();
      let dialog = page.getByRole("dialog", { name: label, exact: true });
      await expect(
        dialog.getByRole("button", {
          name: confirm === "Accept" ? "Reject" : "Accept",
          exact: true,
        }),
      ).toHaveCount(0);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(state.writes).toHaveLength(0);
      await choice.click();
      dialog = page.getByRole("dialog", { name: label, exact: true });
      await dialog.getByRole("button", { name: confirm, exact: true }).click();
      await expect.poll(() => state.writes.some((w) => w.body.action === action)).toBe(true);
    });
  }
  test("organization role filters include own requests; search help and clear are consistent", async ({
    page,
  }) => {
    const state = await fixture(page);
    state.organization({ role: "requested", adminUserId: "other" });
    await page.goto("/groups/organizations");
    const search = page.getByRole("searchbox", { name: "Search organizations", exact: true });
    await expect(search).toHaveAttribute("placeholder", "Search organizations");
    await expect(page.getByRole("button", { name: "Clear search", exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Search organizations: Search help", exact: true })
      .click();
    await expect(
      page.getByText("Type at least 4 characters to search", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    for (const role of ["Admin", "Invited", "Accepted"])
      await page.getByRole("button", { name: role, exact: true }).click();
    await expect(page.getByText(baseOrganization.name, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Requested", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Requested", exact: true }).click();
    await expect(page.getByText("No organizations found", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Requested", exact: true }).click();
    await search.fill("no-matching-club");
    await expect(page.getByText("No organizations found", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByRole("button", { name: "Clear search", exact: true })).toHaveCount(0);
    await expect(page.getByText(baseOrganization.name, { exact: true })).toBeVisible();
  });
  test("personal event period filters have inline search and no global creation action", async ({
    page,
  }) => {
    await fixture(page);
    await page.goto("/events");
    const search = page.getByRole("searchbox", { name: "Search events", exact: true });
    await expect(search).toHaveAttribute("placeholder", "Search events");
    await expect(page.getByRole("link", { name: "New event", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Clear search", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Future", exact: true }).click();
    await expect(page.getByText("No events found", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Past", exact: true }).click();
    await expect(page.getByText("No events found", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Future", exact: true }).click();
    await expect(page.getByText(baseEvent.name, { exact: true })).toBeVisible();
    await search.fill("no-matching-event");
    await expect(page.getByText("No events found", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByText(baseEvent.name, { exact: true })).toBeVisible();
    await page.goto(`/organizations/${orgId}`);
    await page.getByRole("tab", { name: "Events", exact: true }).click();
    await expect(page.getByRole("link", { name: "New event", exact: true })).toHaveAttribute(
      "href",
      `/events/new?organizationId=${orgId}`,
    );
  });
  test("community navigation and public discovery preserve separated sections", async ({
    page,
  }) => {
    await fixture(page);
    await page.goto("/events");
    await expect(page.getByText(baseEvent.name, { exact: true })).toBeVisible();
    const menu = page.getByRole("button", { name: "Toggle menu", exact: true });
    if (await menu.isVisible()) {
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
    }
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Events", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Community", exact: true })
      .click();
    await expect(page).toHaveURL(/\/groups$/);
    await page.getByRole("tab", { name: "Organizations", exact: true }).click();
    await expect(page.getByText(baseOrganization.name, { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/groups\/search$/);
    await expect(page.getByRole("tabpanel", { name: "Search", exact: true })).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Search groups and organizations", exact: true })
      .fill("games");
    await expect(page.getByText("Public games group", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Group join requests will be available later", { exact: true }),
    ).toBeVisible();
    const search = page.getByRole("searchbox", {
      name: "Search groups and organizations",
      exact: true,
    });
    await expect(search).toHaveAttribute("placeholder", "Search groups and organizations");
    await page.getByRole("button", { name: "Groups", exact: true }).click();
    await expect(page.getByText("No results found", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Groups", exact: true }).click();
    await expect(page.getByText("Public games group", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByRole("button", { name: "Clear search", exact: true })).toHaveCount(0);
  });

  test("list failures remain observable and retry recovers instead of reporting an empty success", async ({
    page,
  }) => {
    await fixture(page);
    let failed = true;
    await page.route(
      (url) => url.pathname === "/api/events",
      (route) =>
        failed
          ? route.fulfill({ status: 503, json: { error: "UNAVAILABLE" } })
          : route.fulfill({ json: { items: [baseEvent], nextCursor: null } }),
    );
    await page.goto("/events");
    await page.reload();
    await expect(page.getByText("Could not load events", { exact: true })).toBeVisible();
    await expect(page.getByText("No events found", { exact: true })).toHaveCount(0);
    failed = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText(baseEvent.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Could not load events", { exact: true })).toHaveCount(0);
  });
  test("organization logo, verified address, review submission and failed revision retain input", async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto("/organizations/new");
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    await page.getByRole("button", { name: "Organization name: Field help", exact: true }).click();
    await expect(
      page.getByText("Choose a unique name, from 5 to 120 characters.", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Organization logo: Field help", exact: true }).click();
    await expect(
      page.getByText("JPEG, PNG or WebP, up to 5 MB. A logo can be replaced, not removed.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Upload organization logo", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Organization name", { exact: true }).fill("Browser games club");
    await page
      .getByLabel("Organization logo", { exact: true })
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
    await chooseLocation(page);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page).toHaveURL(new RegExp(`/organizations/${orgId}$`));
    await expect(page.getByText("Awaiting review", { exact: true })).toBeVisible();
    const created = state.writes.find((r) => r.path === "/api/organizations");
    expect(created?.body).toMatchObject({
      name: "Browser games club",
      logoAssetId: assetId,
      location: expect.objectContaining({
        address: location.address,
        longitude: 12.5,
        latitude: 41.9,
      }),
    });
    await page.goto(`/organizations/${orgId}/edit`);
    state.failSave();
    await page.getByLabel("Organization name", { exact: true }).fill("Retained failed proposal");
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Could not save organization" }),
    ).toBeVisible();
    await expect(page.getByLabel("Organization name", { exact: true })).toHaveValue(
      "Retained failed proposal",
    );
  });

  test("new event uses one day, native time-only fields, field help and numeric booking hours", async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto(`/events/new?organizationId=${orgId}`);
    await expect(page.getByLabel("Time zone", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Event name", { exact: true })).toHaveAttribute(
      "placeholder",
      "e.g. Board game evening",
    );
    await expect(
      page.getByLabel("Booking deadline (hours before start)", { exact: true }),
    ).toHaveValue("24");
    await expect(page.getByRole("heading", { name: "Event detail", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Event name: Field help", exact: true }).click();
    await expect(page.getByText(/Choose an event name with 5–120 characters/)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Booking deadline: Field help", exact: true }).click();
    await expect(page.getByText(/Hours before the event starts/)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByLabel("Event name", { exact: true }).fill("Numeric cutoff evening");
    await page.getByLabel("Event date", { exact: true }).fill("2030-06-12");
    await expect(page.getByLabel("Event date", { exact: true })).toHaveAttribute("type", "date");
    await page.getByLabel("Start time", { exact: true }).fill("14:00");
    await expect(page.getByLabel("Start time", { exact: true })).toHaveAttribute("type", "time");
    await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("list", { name: "Steps" }).locator('[aria-current="step"]'),
    ).toHaveText("1");
    await expect(page.getByLabel("End time", { exact: true })).toHaveAttribute("min", "14:01");
    await page.getByLabel("End time", { exact: true }).fill("18:00");
    await page.getByLabel("Booking deadline (hours before start)", { exact: true }).fill("6");
    await chooseLocation(page, "Choose the event address");
    await expect(
      page.getByRole("button", { name: "Choose the event address", exact: true }),
    ).toContainText(location.name);
    await expect(page.getByTestId("event-navigation-bar")).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByRole("list", { name: "Steps" }).locator('[aria-current="step"]'),
    ).toHaveText("2");
    await expect(page.getByText("Numeric cutoff evening", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("No tables yet. Add a table to organize games and players."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
    const body = state.writes.find((row) => row.path === "/api/events")!.body;
    expect(
      (Date.parse(String(body.startsAt)) - Date.parse(String(body.bookingClosesAt))) / 3600000,
    ).toBe(6);
    expect(Date.parse(String(body.endsAt)) - Date.parse(String(body.startsAt))).toBe(4 * 3600000);
    expect(body.location).toMatchObject({ address: location.address });
  });

  test("event partial edit retains unloaded tables and seconds; destructive removal needs confirmation", async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto(`/events/${eventId}/edit`);
    await page.getByLabel("Event name", { exact: true }).fill("Renamed evening");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByText("Unloaded tables are retained. Only explicit removals delete tables.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
    const first = state.writes.find((r) => r.path === `/api/events/${eventId}`);
    expect(first?.body).toMatchObject({
      version: 7,
      tables: [],
      removedTableIds: [],
      startsAt: baseEvent.startsAt,
      endsAt: baseEvent.endsAt,
      bookingClosesAt: baseEvent.bookingClosesAt,
    });
    await page.goto(`/events/${eventId}/edit`);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Remove table: Azul table", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Reset reservations" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(state.writes.filter((r) => r.path === `/api/events/${eventId}`)).toHaveLength(1);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
    expect(
      state.writes.filter((r) => r.path === `/api/events/${eventId}`)[1]?.body.removedTableIds,
    ).toEqual([tableId]);
  });

  test("public details hide private members; requests require no friendship and can be cancelled", async ({
    page,
  }) => {
    const state = await fixture(page);
    state.organization({ role: "none" });
    await page.goto(`/organizations/${orgId}`);
    await page.getByRole("tab", { name: "Members", exact: true }).click();
    await expect(
      page.getByText("Organization members are visible only to confirmed members."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit organization" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Details", exact: true }).click();
    await page.getByRole("button", { name: "Request membership", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cancel request", exact: true })).toBeVisible();
    expect(state.writes.some((row) => row.path.endsWith("/membership"))).toBe(true);
    await page.getByRole("button", { name: "Cancel request", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Cancel request", exact: true });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(state.writes.filter((row) => row.method === "PATCH")).toHaveLength(0);
    await page.getByRole("button", { name: "Cancel request", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Cancel request", exact: true });
    await dialog.getByRole("button", { name: "Cancel request", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Request membership", exact: true }),
    ).toBeVisible();
    expect(state.writes.find((row) => row.method === "PATCH")?.body).toEqual({ action: "cancel" });
  });

  for (const action of ["accept", "decline"] as const) {
    test(`an invitation can be ${action === "accept" ? "accepted" : "declined"} without granting unconfirmed private access`, async ({
      page,
    }) => {
      const state = await fixture(page);
      state.organization({ role: "invited" });
      await page.goto(`/organizations/${orgId}`);
      await page.getByRole("tab", { name: "Members", exact: true }).click();
      await expect(
        page.getByText("Organization members are visible only to confirmed members."),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Details", exact: true }).click();
      await page
        .getByRole("button", { name: "Respond to organization invitation", exact: true })
        .click();
      const invitationDialog = page.getByRole("dialog", {
        name: "Respond to organization invitation",
        exact: true,
      });
      await expect(
        invitationDialog.getByRole("button", { name: "Ban from organization", exact: true }),
      ).toHaveCount(0);
      await invitationDialog
        .getByRole("button", { name: action === "accept" ? "Accept" : "Reject", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: action === "accept" ? "Leave organization" : "Request membership",
          exact: true,
        }),
      ).toBeVisible();
      expect(state.writes.find((row) => row.method === "PATCH")?.body).toEqual({ action });
      if (action === "accept") {
        await page.getByRole("button", { name: "Leave organization", exact: true }).click();
        await page
          .getByRole("dialog", { name: "Leave organization", exact: true })
          .getByRole("button", { name: "Leave organization", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Request membership", exact: true }),
        ).toBeVisible();
      }
    });
  }

  test("administrator approves, excludes and revokes members through confirmed destructive actions", async ({
    page,
  }) => {
    const state = await fixture(page);
    state.memberRow("PENDING");
    await page.goto(`/organizations/${orgId}`);
    await page.getByRole("tab", { name: "Members", exact: true }).click();
    await expect(page.getByText("Target Member", { exact: true })).toBeVisible();
    await expect(page.getByText("target_member", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Respond to membership request: Target Member", exact: true })
      .click();
    const requestDialog = page.getByRole("dialog", {
      name: "Respond to membership request",
      exact: true,
    });
    await expect(requestDialog.getByRole("button", { name: "Reject", exact: true })).toBeVisible();
    await expect(requestDialog.getByRole("button", { name: "Ban", exact: true })).toBeVisible();
    await requestDialog.getByRole("button", { name: "Accept", exact: true }).click();
    await page.getByRole("button", { name: "Remove member: Target Member", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Remove member", exact: true });
    await expect(
      dialog.getByRole("button", { name: "Remove from organization", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Remove and exclude", exact: true }).click();
    await page
      .getByRole("button", { name: "Revoke exclusion: Target Member", exact: true })
      .click();
    await expect(page.getByText("Target Member", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Invite friends", exact: true })).toBeVisible();
    expect(
      state.writes.filter((row) => row.method === "PATCH").map((row) => row.body.action),
    ).toEqual(["approve", "ban", "revoke"]);
  });

  for (const action of ["reject", "ban"] as const) {
    test(`pending membership request offers one action dialog: ${action}`, async ({ page }) => {
      const state = await fixture(page);
      state.memberRow("PENDING");
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`/organizations/${orgId}?tab=members`);
      await page
        .getByRole("button", { name: "Respond to membership request: Target Member", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Respond to membership request",
        exact: true,
      });
      await expect(dialog.getByRole("button")).toHaveText(["Accept", "Reject", "Ban", "Cancel"]);
      await expectButtonsOnOneRow(dialog.getByRole("button", { name: /^(Accept|Reject|Ban)$/ }));
      await expect
        .poll(() =>
          dialog.evaluate((element) => {
            const buttons = Array.from(element.querySelectorAll("button"));
            const cancel = buttons.at(-1)?.getBoundingClientRect();
            return Boolean(
              cancel &&
                buttons.slice(0, -1).every((button) => {
                  const box = button.getBoundingClientRect();
                  return (
                    cancel.top > box.bottom && getComputedStyle(button).flexDirection === "row"
                  );
                }),
            );
          }),
        )
        .toBe(true);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(state.writes.filter((row) => row.method === "PATCH")).toHaveLength(0);
      await page
        .getByRole("button", { name: "Respond to membership request: Target Member", exact: true })
        .click();
      await dialog
        .getByRole("button", {
          name: action === "reject" ? "Reject" : "Ban",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Respond to membership request: Target Member",
          exact: true,
        }),
      ).toHaveCount(0);
      expect(
        state.writes.filter((row) => row.method === "PATCH").map((row) => row.body.action),
      ).toEqual([action]);
      expect(state.writes.some((row) => row.path.includes("/blocks"))).toBe(false);
    });
  }
  test("admin cancels a pending invitation only after confirmation", async ({ page }) => {
    const state = await fixture(page);
    state.memberRow("PENDING", "INVITATION");
    await page.goto(`/organizations/${orgId}?tab=members`);
    await page
      .getByRole("button", { name: "Cancel organization invitation: Target Member", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Cancel organization invitation",
      exact: true,
    });
    await expect(dialog.getByRole("button")).toHaveCount(2);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(state.writes.filter((row) => row.method === "PATCH")).toHaveLength(0);
    await page
      .getByRole("button", { name: "Cancel organization invitation: Target Member", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Cancel organization invitation", exact: true })
      .click();
    await expect(page.getByText("Target Member", { exact: true })).toHaveCount(0);
    expect(
      state.writes.filter((row) => row.method === "PATCH").map((row) => row.body.action),
    ).toEqual(["remove"]);
  });

  test("ordinary removal is separate from global social blocking and keeps an empty invitation slot", async ({
    page,
  }) => {
    const state = await fixture(page);
    state.memberRow("ACCEPTED");
    await page.goto(`/organizations/${orgId}?tab=members`);
    await expect(page.getByRole("button", { name: "Invite friends", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Follow: Target Member", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send friend request: Target Member", exact: true }),
    ).toHaveCount(0);
    const socialRow = page.getByRole("listitem").filter({ hasText: "Target Member" });
    await socialRow.getByRole("button", { name: "Actions", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Follow", exact: true })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Send friend request", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: "Block user globally", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Remove member: Target Member", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Remove member", exact: true });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(state.writes.filter((row) => row.method === "PATCH")).toHaveLength(0);
    await page.getByRole("button", { name: "Remove member: Target Member", exact: true }).click();
    await dialog.getByRole("button", { name: "Remove from organization", exact: true }).click();
    await expect(page.getByText("Target Member", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Invite friends", exact: true })).toBeVisible();
    expect(
      state.writes.filter((row) => row.method === "PATCH").map((row) => row.body.action),
    ).toEqual(["remove"]);
    expect(
      state.writes.some((row) => row.path === "/api/relationships" || row.path.includes("/blocks")),
    ).toBe(false);
  });

  for (const decision of ["approve", "reject"] as const) {
    test(`moderator can ${decision} a private proposal while approved information remains visible`, async ({
      page,
    }) => {
      const state = await fixture(page);
      state.review();
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`/moderation/${orgId}`);
      await expect(page.getByText("Proposed community club", { exact: true })).toBeVisible();
      await expect(page.getByText("Manage organization", { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: "Manage organization: Manage organization", exact: true })
        .click();
      await expect(
        page.getByText(
          "Approve the proposed organization information, or reject it with a reason so the creator can correct it. Previously approved information remains available.",
        ),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByLabel("Rejection reason", { exact: true })).toHaveAttribute(
        "placeholder",
        "Reject reason",
      );
      await expectButtonsOnOneRow(
        page.getByRole("button", { name: /^(Approve|Reject) organization$/ }),
      );
      await expect(page.getByText("Currently approved information", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Reject organization", exact: true }),
      ).toBeDisabled();
      if (decision === "reject")
        await page
          .getByLabel("Rejection reason", { exact: true })
          .fill("Verified address needs correction");
      await page
        .getByRole("button", {
          name: decision === "approve" ? "Approve organization" : "Reject organization",
          exact: true,
        })
        .click();
      await expect(
        page.getByText("No organizations awaiting review", { exact: true }),
      ).toBeVisible();
      expect(state.writes.find((row) => row.path.endsWith("/review"))?.body).toEqual({
        decision,
        version: baseOrganization.version,
        ...(decision === "reject" ? { reason: "Verified address needs correction" } : {}),
      });
    });
  }

  test("revoked moderator authority hides proposals and leaves an observable error", async ({
    page,
  }) => {
    const state = await fixture(page);
    state.review(true);
    await page.goto(`/moderation/${orgId}`);
    await expect(page.getByText("Moderator access required", { exact: true })).toBeVisible();
    await expect(page.getByText("Proposed community club", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Approve organization", exact: true }),
    ).toHaveCount(0);
  });

  test("an inaccessible event shows a retry instead of a permanent table skeleton", async ({
    page,
  }) => {
    await fixture(page);
    let tableRequests = 0;
    await page.route(/\/api\/events(?:\?|$)/, (route) =>
      route.fulfill({ json: { items: [], nextCursor: null } }),
    );
    await page.route(
      (url) => url.pathname === `/api/events/${eventId}`,
      (route) => route.fulfill({ status: 404, json: { error: "EVENT_NOT_FOUND" } }),
    );
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith(`/tables/${tableId}`)) tableRequests++;
    });
    await page.goto(`/events/${eventId}/tables/${tableId}`);
    const error = page.getByRole("alert").filter({ hasText: "Could not load table" });
    await expect(error).toBeVisible();
    const requestsBeforeRetry = tableRequests;
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    expect(tableRequests).toBe(requestsBeforeRetry);
  });

  test("members request explicit seats and closed table controls disappear", async ({ page }) => {
    const state = await fixture(page);
    state.member();
    await page.goto(`/events/${eventId}/tables/${tableId}`);
    await page.getByRole("button", { name: "Request a place", exact: true }).click();
    await expect
      .poll(() => state.writes.filter((r) => r.path.endsWith("/bookings")).length)
      .toBe(1);
    state.close();
    await page.reload();
    await expect(
      page.getByText("Bookings are closed. Results can still be recorded.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Request a place", exact: true })).toHaveCount(0);
  });
}
for (const [name, viewport] of [
  { name: "desktop", viewport: { width: 1280, height: 900 } },
  { name: "mobile-width web", viewport: { width: 414, height: 896 } },
].map((config) => [config.name, config.viewport] as const)) {
  test.describe(name, () => {
    test.use({ viewport });
    communityAcceptance();
  });
}
