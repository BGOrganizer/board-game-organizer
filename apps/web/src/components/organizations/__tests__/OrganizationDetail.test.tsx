import type {
  OrganizationMemberResponse,
  OrganizationResponse,
} from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { OrganizationDetail } from "../OrganizationDetail";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  failed: vi.fn(),
  optimistic: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "viewer",
    getToken: async () => "fresh-token",
    feedback: { onOptimisticUpdate: mocks.optimistic, onError: mocks.failed },
  }),
}));
const location = {
  id: "location",
  name: "Club address",
  address: "Via Roma 1, Italia",
  latitude: 41,
  longitude: 12,
};
const base: OrganizationResponse = {
  id: "org",
  adminUserId: "viewer",
  name: "Test club",
  location,
  logoAssetId: "logo",
  logo: "data:image/webp;base64,AQID",
  status: "CREATED",
  role: "admin",
  memberCount: 2,
  publishedEventCount: 5,
  myMembership: null,
  approved: { name: "Test club", location, logoAssetId: "logo" },
  version: 1,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
function person(
  userId: string,
  status: "ACCEPTED" | "PENDING" | "EXCLUDED",
  kind: "REQUEST" | "INVITATION" = "REQUEST",
): OrganizationMemberResponse {
  return {
    userId,
    name: `${userId} Full Name`,
    username: `${userId}_nick`,
    avatarUrl: null,
    isAdmin: false,
    membership: {
      id: userId,
      organizationId: "org",
      userId,
      kind,
      status,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    },
    social: { isFollowing: false, isFollower: false, isFriend: false, blockedByMe: false },
  };
}
function setup(patch: Partial<OrganizationResponse> = {}, paginated = false) {
  let organization = { ...base, ...patch },
    failed = false,
    denied = false,
    eventsFailed = false;
  const people = [
    { ...person("viewer", "ACCEPTED"), isAdmin: true, membership: null },
    person("confirmed", "ACCEPTED"),
    person("requested", "PENDING"),
    person("invited", "PENDING", "INVITATION"),
    person("excluded", "EXCLUDED"),
  ];
  if (paginated) people.push(person("second", "ACCEPTED"));
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/members") && init?.method !== "POST") {
      if (denied) return new Response('{"error":"ORGANIZATION_MEMBER_REQUIRED"}', { status: 403 });
      const mode = parsed.searchParams.get("mode") ?? "accepted";
      const status = { accepted: "ACCEPTED", pending: "PENDING", excluded: "EXCLUDED" }[mode];
      const rows = people.filter((p) =>
        p.isAdmin ? mode === "accepted" : p.membership?.status === status,
      );
      if (paginated && mode === "accepted")
        return new Response(
          JSON.stringify({
            items: parsed.searchParams.has("cursor") ? rows.slice(2) : rows.slice(0, 2),
            nextCursor: parsed.searchParams.has("cursor") ? null : "accepted-next",
          }),
        );
      return new Response(JSON.stringify({ items: rows, nextCursor: null }));
    }
    if (init?.method === "PATCH") {
      if (failed) return new Response('{"error":"MEMBERSHIP_CHANGED"}', { status: 409 });
      const action = JSON.parse(String(init.body)).action;
      const target = people.find((row) => row.userId === parsed.pathname.split("/").at(-1));
      if (target?.membership)
        target.membership = {
          ...target.membership,
          status:
            action === "remove" || action === "revoke"
              ? "LEFT"
              : action === "ban"
                ? "EXCLUDED"
                : action === "approve"
                  ? "ACCEPTED"
                  : "DECLINED",
        };
      return new Response(JSON.stringify(target?.membership));
    }
    if (parsed.pathname.endsWith("/events"))
      return eventsFailed
        ? new Response("{}", { status: 503 })
        : new Response('{"items":[],"nextCursor":null}');
    if (parsed.pathname === "/api/organizations/org")
      return new Response(JSON.stringify(organization));
    if (parsed.pathname === "/api/relationships" && init?.method !== "POST")
      return new Response('{"rows":[],"nextCursor":null}');
    if (
      parsed.pathname === "/api/relationships" &&
      parsed.searchParams.get("type") === "follow" &&
      init?.method === "POST"
    ) {
      const target = people.find(
        (row) => row.userId === JSON.parse(String(init.body)).targetUserId,
      );
      if (target?.social) target.social.isFollowing = true;
    }
    return new Response('{"success":true}');
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  renderWithI18n(
    <QueryClientProvider client={client}>
      <OrganizationDetail organizationId="org" />
    </QueryClientProvider>,
  );
  return {
    fetch,
    people,
    fail: () => {
      failed = true;
    },
    deny: () => {
      denied = true;
    },
    retry: () => {
      denied = false;
      eventsFailed = false;
    },
    failEvents: () => {
      eventsFailed = true;
    },
    organization: (value: Partial<OrganizationResponse>) => {
      organization = { ...organization, ...value };
    },
    client,
  };
}
async function members() {
  await screen.findByText("Test club");
  fireEvent.click(screen.getByRole("tab", { name: "Members" }));
  await screen.findByText("confirmed Full Name");
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("organization detail and member interactions", () => {
  it("puts accepted-member Leave in the header, icon-only, with confirmation and no immediate mutation", async () => {
    const state = setup({ role: "accepted", adminUserId: "another" });
    const button = await screen.findByRole("button", { name: "Leave organization" });
    expect(button.textContent).toBe("");
    expect(button.parentElement?.querySelector("h1")?.textContent).toBe("Organization details");
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Leave organization" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(state.fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });
  it("puts pending self-request cancellation in the card footer, preserving its confirmation", async () => {
    const state = setup({ role: "requested", adminUserId: "another" });
    const button = await screen.findByRole("button", {
      name: "Cancel request",
    });
    expect(button.textContent).toBe("");
    expect(button.parentElement?.className).toContain("justify-end");
    expect(screen.getByText("Approved members: 2")).toBeTruthy();
    expect(screen.getByText("Published events: 5")).toBeTruthy();
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Cancel request" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Cancel$/ }));
    expect(state.fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });
  it("keeps controls contextual, invite slot first, full name/nickname, and private lists ordered", async () => {
    const state = setup();
    await screen.findByText("Approved");
    expect(screen.getByRole("link", { name: "Edit organization" }).getAttribute("href")).toBe(
      "/organizations/org/edit",
    );
    expect(screen.queryByRole("link", { name: "New event" })).toBeNull();
    expect(state.fetch.mock.calls.some(([url]) => url.includes("/members?"))).toBe(false);
    await members();
    await screen.findByText("excluded Full Name");
    expect(screen.getByText("confirmed_nick")).toBeTruthy();
    const rows = within(screen.getByRole("region", { name: "Members" })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(
      [
        "Select a friend",
        "viewer Full Name",
        "confirmed Full Name",
        "requested Full Name",
        "invited Full Name",
        "excluded Full Name",
      ].map((name) => expect.stringContaining(name)),
    );
    for (const badge of [
      "Organization admin",
      "Membership requested",
      "Invited",
      "Excluded member",
    ])
      expect(screen.getByRole("img", { name: badge })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Invite friends" }));
    expect(mocks.push).toHaveBeenCalledWith("/organizations/org/invite");
    expect(screen.queryByRole("button", { name: "Follow: confirmed Full Name" })).toBeNull();
    const confirmedRow = screen.getByText("confirmed Full Name").closest("li")!;
    fireEvent.click(within(confirmedRow).getByRole("button", { name: "Actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Follow" }));
    await waitFor(() =>
      expect(
        state.fetch.mock.calls.some(
          ([url, init]) =>
            url.includes("/api/relationships?type=follow") && init?.method === "POST",
        ),
      ).toBe(true),
    );
  });
  it("confirms ordinary removal, permits cancellation and keeps the invite slot after success", async () => {
    const state = setup();
    await members();
    await screen.findByText("excluded Full Name");
    fireEvent.click(screen.getByRole("button", { name: "Remove member: confirmed Full Name" }));
    let dialog = screen.getByRole("dialog", { name: "Remove member" });
    expect(within(dialog).getByRole("button", { name: "Remove from organization" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Remove and exclude" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(state.fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove member: confirmed Full Name" }));
    dialog = screen.getByRole("dialog", { name: "Remove member" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from organization" }));
    await waitFor(() => expect(screen.queryByText("confirmed Full Name")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Remove member" })).toBeNull());
    expect(state.people.find((p) => p.userId === "confirmed")?.membership?.status).toBe("LEFT");
    expect(screen.getByRole("button", { name: "Invite friends" })).toBeTruthy();
  });
  it("moves exclusions to the final feed and revocation removes their nonmember row", async () => {
    const state = setup();
    await members();
    await screen.findByText("excluded Full Name");
    fireEvent.click(screen.getByRole("button", { name: "Remove member: confirmed Full Name" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Remove member" })).getByRole("button", {
        name: "Remove and exclude",
      }),
    );
    await screen.findByRole("button", { name: "Revoke exclusion: confirmed Full Name" });
    const rows = within(screen.getByRole("region", { name: "Members" })).getAllByRole("listitem");
    expect(
      rows.slice(-2).every((row) => within(row).queryByRole("img", { name: "Excluded member" })),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Revoke exclusion: confirmed Full Name" }));
    await waitFor(() => expect(screen.queryByText("confirmed Full Name")).toBeNull());
    expect(state.people.find((p) => p.userId === "confirmed")?.membership?.status).toBe("LEFT");
  });
  it("rolls back failed removal and preserves request approval/rejection, not invitation self-approval", async () => {
    const state = setup();
    await members();
    await screen.findByText("excluded Full Name");
    state.fail();
    fireEvent.click(screen.getByRole("button", { name: "Remove member: confirmed Full Name" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Remove member" })).getByRole("button", {
        name: "Remove from organization",
      }),
    );
    await waitFor(() =>
      expect(mocks.failed).toHaveBeenCalledWith(expect.any(Error), "remove_organization_member"),
    );
    await screen.findByText("confirmed Full Name");
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Remove member" })).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Approve request: requested Full Name" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Reject request: requested Full Name" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Respond to membership request: requested Full Name" }),
    );
    const requestDialog = screen.getByRole("dialog", { name: "Respond to membership request" });
    expect(
      within(requestDialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Accept", "Reject", "Ban", "Cancel"]);
    expect(
      within(requestDialog).getByRole("button", { name: "Accept" }).parentElement?.className,
    ).toContain("flex-row");
    expect(
      within(requestDialog).getByRole("button", { name: "Accept" }).parentElement?.className,
    ).not.toContain("flex-col");
    expect(
      within(requestDialog)
        .getAllByRole("button")
        .every((button) => button.querySelector("svg")),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Approve request: invited Full Name" })).toBeNull();
  });
  it.each(["approve", "reject", "ban"] as const)(
    "responds to pending requests with %s without a social block",
    async (action) => {
      const state = setup();
      await members();
      await screen.findByText("excluded Full Name");
      const row = screen.getByText("requested Full Name").closest("li")!;
      expect(within(row).getAllByRole("button")).toHaveLength(2);
      expect(
        within(row).queryByRole("button", { name: /Follow|Unfollow|Send friend request/ }),
      ).toBeNull();
      fireEvent.click(
        within(row).getByRole("button", {
          name: "Respond to membership request: requested Full Name",
        }),
      );
      const dialog = screen.getByRole("dialog", { name: "Respond to membership request" });
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: action === "approve" ? "Accept" : action === "reject" ? "Reject" : "Ban",
        }),
      );
      await waitFor(() =>
        expect(
          state.fetch.mock.calls.some(
            ([, init]) =>
              init?.method === "PATCH" && JSON.parse(String(init.body)).action === action,
          ),
        ).toBe(true),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Respond to membership request" })).toBeNull(),
      );
      expect(state.people.find((p) => p.userId === "requested")?.membership?.status).toBe(
        action === "approve" ? "ACCEPTED" : action === "ban" ? "EXCLUDED" : "DECLINED",
      );
      expect(
        state.fetch.mock.calls.some(
          ([url, init]) => url.includes("/blocks") && init?.method !== "GET",
        ),
      ).toBe(false);
    },
  );
  it("keeps a failed pending-request dialog actionable after selective rollback", async () => {
    const state = setup();
    await members();
    await screen.findByText("excluded Full Name");
    state.fail();
    fireEvent.click(
      screen.getByRole("button", { name: "Respond to membership request: requested Full Name" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Respond to membership request" })).getByRole(
        "button",
        { name: "Accept" },
      ),
    );
    await waitFor(() =>
      expect(mocks.failed).toHaveBeenCalledWith(expect.any(Error), "approve_organization_join"),
    );
    await screen.findByRole("dialog", { name: "Respond to membership request" });
    expect(state.people.find((p) => p.userId === "requested")?.membership?.status).toBe("PENDING");
    expect(screen.getByRole("button", { name: "Ban" }).hasAttribute("disabled")).toBe(false);
  });
  it("confirms invitation cancellation without offering an admin acceptance or ban", async () => {
    const state = setup();
    await members();
    await screen.findByText("excluded Full Name");
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel organization invitation: invited Full Name" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Cancel organization invitation" });
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Cancel", "Cancel organization invitation"]);
    fireEvent.click(within(dialog).getByRole("button", { name: /^Cancel$/ }));
    expect(state.fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel organization invitation: invited Full Name" }),
    );
    dialog = screen.getByRole("dialog", { name: "Cancel organization invitation" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel organization invitation" }));
    await waitFor(() => expect(screen.queryByText("invited Full Name")).toBeNull());
    expect(state.people.find((p) => p.userId === "invited")?.membership?.status).toBe("LEFT");
  });
  it("offers an invited viewer a response dialog in Members without fetching the private roster", async () => {
    const state = setup({ role: "invited", adminUserId: "another" });
    await screen.findByText("Test club");
    fireEvent.click(screen.getByRole("tab", { name: "Members" }));
    fireEvent.click(screen.getByRole("button", { name: "Respond to organization invitation" }));
    const dialog = screen.getByRole("dialog", { name: "Respond to organization invitation" });
    expect(within(dialog).getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(state.fetch.mock.calls.some(([url]) => url.includes("/members?"))).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(state.fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });
  it("loads subsequent accepted pages before pending and excluded sources", async () => {
    const state = setup({}, true);
    await members();
    expect(screen.queryByText("requested Full Name")).toBeNull();
    expect(state.fetch.mock.calls.some(([url]) => url.includes("mode=pending"))).toBe(false);
    expect(state.fetch.mock.calls.some(([url]) => url.includes("mode=excluded"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("second Full Name");
    await screen.findByText("excluded Full Name");
    const calls = state.fetch.mock.calls.map(([url]) => url);
    expect(calls.findIndex((url) => url.includes("cursor=accepted-next"))).toBeLessThan(
      calls.findIndex((url) => url.includes("mode=pending")),
    );
    expect(calls.findIndex((url) => url.includes("mode=pending"))).toBeLessThan(
      calls.findIndex((url) => url.includes("mode=excluded")),
    );
  });
  it("keeps event search embedded, contextual creation authorized, and retry observable", async () => {
    const state = setup();
    await screen.findByText("Test club");
    state.failEvents();
    fireEvent.click(screen.getByRole("tab", { name: "Events" }));
    expect(screen.getByRole("link", { name: "New event" }).getAttribute("href")).toBe(
      "/events/new?organizationId=org",
    );
    expect(screen.queryByRole("link", { name: "Edit organization" })).toBeNull();
    await screen.findByText("Could not load events");
    state.retry();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No events found");
    expect(screen.getByRole("searchbox", { name: "Search events" })).toBeTruthy();
  });
  it("keeps pending approval visible, invite slot disabled, and member fetch failures recoverable", async () => {
    const state = setup({
      approved: undefined,
      reviewStatus: "REJECTED",
      rejectionReason: "Correct the logo",
    });
    await screen.findByText("Changes rejected");
    expect(screen.getByText("Correct the logo")).toBeTruthy();
    await members();
    expect(screen.getByRole("button", { name: "Invite friends" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByText("Invitations require an approved organization.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove member: confirmed Full Name" }));
    expect(screen.getByRole("dialog", { name: "Remove member" })).toBeTruthy();
    state.deny();
    await state.client.invalidateQueries();
    await screen.findByText("Could not load organization members");
    expect(screen.queryByRole("dialog", { name: "Remove member" })).toBeNull();
    expect(screen.queryByText("confirmed Full Name")).toBeNull();
    state.retry();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("confirmed Full Name");
  });
  it("never fetches private rows or grants edit/create actions to visitors", async () => {
    const state = setup({ role: "none", adminUserId: "another" });
    await screen.findByText("Test club");
    fireEvent.click(screen.getByRole("tab", { name: "Members" }));
    expect(
      screen.getByText("Organization members are visible only to confirmed members."),
    ).toBeTruthy();
    expect(state.fetch.mock.calls.some(([url]) => url.includes("/members?"))).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "Events" }));
    await screen.findByText("No events found");
    expect(screen.queryByRole("link", { name: "New event" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit organization" })).toBeNull();
  });
});
