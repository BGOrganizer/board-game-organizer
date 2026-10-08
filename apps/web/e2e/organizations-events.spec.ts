import type {
  EventResponse,
  EventTableResponse,
  OrganizationMemberResponse,
  OrganizationMembership,
  OrganizationResponse,
} from "@board-game-organizer/schemas";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
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
  tableCount: 23,
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
  startsAt: baseEvent.startsAt,
  endsAt: baseEvent.endsAt,
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
            : action === "ban" || action === "remove"
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
        event = { ...event, ...body, adminUserId: viewer, version: event.version + 1 };
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
      const mode = new URL(req.url()).searchParams.get("scope");
      if (mode === "moderation" && denyReview)
        return route.fulfill({ status: 403, json: { error: "MODERATOR_REQUIRED" } });
      return route.fulfill({
        json: {
          items:
            mode === "moderation" && organization.reviewStatus !== "PENDING" ? [] : [organization],
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
      const status = mode === "pending" ? "PENDING" : mode === "excluded" ? "EXCLUDED" : "ACCEPTED";
      return route.fulfill({
        json: {
          items: members.filter((person) => person.membership?.status === status),
          nextCursor: null,
        },
      });
    }
    if (path === "/api/groups/discovery")
      return route.fulfill({
        json: {
          items: [
            {
              id: "77777777-7777-4777-8777-777777777777",
              name: "Public games group",
              memberCount: 4,
              createdAt: now,
            },
          ],
          nextCursor: null,
        },
      });
    if (path === `/api/events/${eventId}`) return route.fulfill({ json: event });
    if (path === `/api/events/${eventId}/tables`)
      return route.fulfill({ json: { items: [table], nextCursor: "unloaded-table-cursor" } });
    if (path === `/api/events/${eventId}/tables/${tableId}`) return route.fulfill({ json: table });
    if (path.endsWith("/bookings")) return route.fulfill({ json: { items: [], nextCursor: null } });
    if (path === "/api/events" || path.endsWith("/events"))
      return route.fulfill({ json: { items: [event], nextCursor: null } });
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
    memberRow: (status: OrganizationMembership["status"]) => {
      members.push({
        userId: "user_target",
        username: "target_member",
        avatarUrl: null,
        isAdmin: false,
        membership: membership("user_target", "REQUEST", status),
      });
    },
    failSave: () => {
      failSave = true;
    },
    succeed: () => {
      failSave = false;
    },
    member: () => {
      event = { ...event, role: "member", canModify: false };
    },
    close: () => {
      event = { ...event, canModify: false, closedAt: new Date().toISOString() } as typeof event;
    },
  };
}
async function chooseLocation(page: Page) {
  await page.getByRole("button", { name: "Choose a verified address" }).click();
  await page.getByRole("textbox", { name: "Location name" }).fill(location.name);
  await page.getByRole("searchbox", { name: "Search address" }).fill("Via Roma Rome");
  await page.getByRole("button", { name: location.address, exact: true }).click();
  await page.getByRole("button", { name: "Confirm location" }).click();
}

function communityAcceptance() {
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
      .getByRole("link", { name: "Groups and organizations", exact: true })
      .click();
    await expect(page).toHaveURL(/\/groups$/);
    await page.getByRole("tab", { name: "Organizations", exact: true }).click();
    await expect(page.getByText(baseOrganization.name, { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/groups\/search$/);
    await expect(page.getByRole("tabpanel", { name: "Search", exact: true })).toBeVisible();
    await page
      .getByRole("textbox", { name: "Search groups and organizations", exact: true })
      .fill("games");
    await expect(page.getByText("Public games group", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Group join requests will be available later", { exact: true }),
    ).toBeVisible();
  });

  test("organization logo, verified address, review submission and failed revision retain input", async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto("/organizations/new");
    await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
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
    await expect(
      page.getByText("Organization members are visible only to confirmed members."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit organization" })).toHaveCount(0);
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
      await expect(
        page.getByText("Organization members are visible only to confirmed members."),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: action === "accept" ? "Accept invitation" : "Decline invitation",
          exact: true,
        })
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
    await page.getByRole("tab", { name: "Requests and invitations", exact: true }).click();
    await page.getByRole("button", { name: "Approve request: target_member", exact: true }).click();
    await page.getByRole("tab", { name: "Members", exact: true }).click();
    await page.getByRole("button", { name: "Exclude member: target_member", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Exclude member", exact: true });
    await dialog.getByRole("button", { name: "Exclude member", exact: true }).click();
    await page.getByRole("tab", { name: "Excluded members", exact: true }).click();
    await page
      .getByRole("button", { name: "Revoke exclusion: target_member", exact: true })
      .click();
    await expect(page.getByText("No members found", { exact: true })).toBeVisible();
    expect(
      state.writes.filter((row) => row.method === "PATCH").map((row) => row.body.action),
    ).toEqual(["approve", "ban", "revoke"]);
  });

  for (const decision of ["approve", "reject"] as const) {
    test(`moderator can ${decision} a private proposal while approved information remains visible`, async ({
      page,
    }) => {
      const state = await fixture(page);
      state.review();
      await page.goto(`/moderation/${orgId}`);
      await expect(page.getByText("Proposed community club", { exact: true })).toBeVisible();
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
    await page.route(`**/api/events/${eventId}`, (route) =>
      route.fulfill({ status: 404, json: { error: "EVENT_NOT_FOUND" } }),
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
