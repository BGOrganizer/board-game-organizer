import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupDetail } from "../GroupDetail";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "guest",
    getToken: async () => "fresh",
  }),
}));
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ ...navigation, push: vi.fn(), back: vi.fn() }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  navigation.replace.mockClear();
});
function mount(initialTab: "info" | "members" | "events" = "info") {
  renderWithI18n(
    <>
      <header data-testid="app-header">
        <div id="page-header-actions" />
      </header>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <GroupDetail groupId={groupRecord.id} initialTab={initialTab} />
      </QueryClientProvider>
    </>,
  );
}
it("pending members can read permitted information and accepted members, never events/rankings/social actions", async () => {
  const invited = {
    ...groupRecord,
    role: "invited",
    canViewEvents: false,
    canViewRankings: false,
    canSocialInteract: false,
    canEdit: false,
    canInvite: false,
    eventCount: null,
    myMembership: {
      id: groupRecord.id,
      groupId: groupRecord.id,
      userId: "guest",
      kind: "INVITATION",
      status: "PENDING",
      version: 1,
      createdAt: groupRecord.createdAt,
      updatedAt: groupRecord.updatedAt,
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/members?")
              ? {
                  items: [
                    {
                      userId: "owner",
                      name: "Owner",
                      avatarUrl: null,
                      username: null,
                      isAdmin: true,
                      membership: null,
                      ban: null,
                    },
                  ],
                  nextCursor: null,
                }
              : invited,
          ),
        ),
    ),
  );
  mount();
  expect(await screen.findByRole("button", { name: "Accept" })).not.toBeNull();
  const accept = screen.getByRole("button", { name: "Accept" }),
    decline = screen.getByRole("button", { name: "Decline" });
  expect(accept.closest(".max-w-md")?.className).toContain("mx-auto");
  expect(screen.getByRole("tabpanel").lastElementChild).toBe(accept.closest(".max-w-md"));
  expect(accept.querySelector("svg.lucide-check")).not.toBeNull();
  expect(decline.querySelector("svg.lucide-x")).not.toBeNull();
  expect(
    screen.getByText(groupRecord.name).compareDocumentPosition(accept) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  const strip = screen
    .getByRole("tablist", { name: "Group sections" })
    .closest('[data-slot="tabs-list-container"]');
  expect(strip?.classList.contains("self-center")).toBe(true);
  expect(strip?.classList.contains("mt-4")).toBe(true);
  expect(screen.queryByRole("tab", { name: "Events" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Rankings" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Members" }));
  expect(await screen.findByText("Owner")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Delete group" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Exclude a user" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Contact actions/ })).toBeNull();
});
it("opens the contextual Events tab directly without the main Events destination", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(url.includes("/events") ? { items: [], nextCursor: null } : groupRecord),
        ),
    ),
  );
  mount("events");
  await screen.findByRole("tab", { name: "Events", selected: true });
});
it("moves accepted member departure to the danger header action and preserves explicit confirmation", async () => {
  let current = {
    ...groupRecord,
    role: "accepted",
    canEdit: false,
    canInvite: false,
    myMembership: {
      id: groupRecord.id,
      groupId: groupRecord.id,
      userId: "guest",
      status: "ACCEPTED",
      kind: "INVITATION",
      version: 3,
      createdAt: groupRecord.createdAt,
      updatedAt: groupRecord.updatedAt,
    },
  };
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH")
      current = {
        ...current,
        role: "none",
        canViewEvents: false,
        canViewMembers: false,
        canViewRankings: false,
        myMembership: { ...current.myMembership, status: "LEFT", version: 4 },
      };
    return new Response(JSON.stringify(init?.method === "PATCH" ? current.myMembership : current));
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  const leave = await screen.findByRole("button", { name: "Leave group" });
  expect(leave.closest("header")).toBe(screen.getByTestId("app-header"));
  expect(leave.querySelector("svg.lucide-log-out")).not.toBeNull();
  fireEvent.click(leave);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  fireEvent.click(leave);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Leave group" })).toBeNull());
  expect(
    JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)),
  ).toEqual({ action: "cancel", version: 3 });
});
it.each([
  ["PRIVATE", "accept"],
  ["PRIVATE", "decline"],
  ["PUBLIC", "accept"],
  ["PUBLIC", "decline"],
] as const)(
  "keeps received %s invitations in their card with explicit %s consent",
  async (type, action) => {
    const invitation = {
      id: groupRecord.id,
      groupId: groupRecord.id,
      userId: "guest",
      kind: "INVITATION",
      status: "PENDING",
      version: 2,
      createdAt: groupRecord.createdAt,
      updatedAt: groupRecord.updatedAt,
    };
    let current = {
      ...groupRecord,
      type,
      role: "invited",
      canEdit: false,
      canInvite: false,
      canViewEvents: false,
      canViewRankings: false,
      canSocialInteract: false,
      myMembership: invitation,
    };
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH")
        current = {
          ...current,
          role: action === "accept" ? "accepted" : "none",
          canViewEvents: action === "accept",
          canViewRankings: action === "accept",
          canViewMembers: action === "accept",
          canSocialInteract: action === "accept",
          myMembership: {
            ...invitation,
            status: action === "accept" ? "ACCEPTED" : "DECLINED",
            version: 3,
          },
        };
      return new Response(
        JSON.stringify(init?.method === "PATCH" ? current.myMembership : current),
      );
    });
    vi.stubGlobal("fetch", fetch);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: action === "accept" ? "Accept" : "Decline" }),
    );
    if (action === "decline")
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Accept" })).toBeNull());
    expect(
      JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)),
    ).toEqual({ action, version: 2 });
  },
);
it("keeps public request/pending cancellation centered after Overview and permits read-only members before requesting", async () => {
  let requested = false;
  const membership = {
    id: groupRecord.id,
    groupId: groupRecord.id,
    userId: "guest",
    kind: "REQUEST",
    status: "PENDING",
    version: 1,
    createdAt: groupRecord.createdAt,
    updatedAt: groupRecord.updatedAt,
  };
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      requested = true;
      return new Response(JSON.stringify(membership));
    }
    if (init?.method === "PATCH") {
      requested = false;
      return new Response(JSON.stringify({ ...membership, status: "LEFT", version: 2 }));
    }
    return new Response(
      JSON.stringify(
        url.includes("/members?")
          ? {
              items: [
                {
                  userId: "owner",
                  name: "Owner",
                  username: null,
                  avatarUrl: null,
                  isAdmin: true,
                  membership: null,
                  ban: null,
                },
              ],
              nextCursor: null,
            }
          : {
              ...groupRecord,
              type: "PUBLIC",
              role: requested ? "requested" : "none",
              myMembership: requested ? membership : null,
              canViewMembers: true,
              canViewEvents: false,
              canViewRankings: false,
              canSocialInteract: false,
              canInvite: false,
              canEdit: false,
            },
      ),
    );
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  const request = await screen.findByRole("button", { name: "Request membership" });
  expect(screen.getByRole("tabpanel").lastElementChild).toBe(request.closest(".max-w-md"));
  expect(request.closest(".max-w-md")?.className).toContain("items-center");
  expect(request.querySelector("svg.lucide-user-round-plus")).not.toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Members" }));
  expect(await screen.findByText("Owner")).not.toBeNull();
  expect(screen.queryByRole("button", { name: /Contact actions/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Invite friends" })).toBeNull();
  expect(
    fetch.mock.calls.every(([url]) => !url.includes("mode=pending") && !url.includes("mode=bans")),
  ).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
  fireEvent.click(screen.getByRole("button", { name: "Request membership" }));
  const cancel = await screen.findByRole("button", { name: "Cancel request" });
  const reason = screen.getByText(/Membership pending\./);
  expect(screen.getByRole("tabpanel").lastElementChild).toBe(cancel.closest(".max-w-md"));
  expect(reason.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(cancel.querySelector("svg.lucide-x")).not.toBeNull();
  expect(screen.queryByRole("tab", { name: "Events" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Rankings" })).toBeNull();
  fireEvent.click(cancel);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await screen.findByRole("button", { name: "Request membership" });
  expect(
    JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)),
  ).toEqual({ action: "cancel", version: 1 });
});
it("puts owner deletion in app header and requires explicit cascade confirmation; blocks repeat/cancel while pending", async () => {
  let finish!: (value: Response) => void;
  let deleted = false;
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "DELETE")
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return new Response(
      JSON.stringify(deleted ? { error: "GROUP_NOT_FOUND" } : { ...groupRecord, eventCount: 3 }),
      { status: deleted ? 404 : 200 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  const button = await screen.findByRole("button", { name: "Delete group" });
  expect(button.closest("header")).toBe(screen.getByTestId("app-header"));
  fireEvent.click(button);
  let dialog = await screen.findByRole("dialog", { name: "Delete group" });
  expect(
    within(dialog).getByText(
      /all its events, tables, registrations, votes, results and group rankings/,
    ),
  ).not.toBeNull();
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog", { name: "Delete group" })).toBeNull();
  fireEvent.click(button);
  dialog = await screen.findByRole("dialog", { name: "Delete group" });
  const confirm = within(dialog).getByRole("button", { name: "Delete group and events" });
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1),
  );
  expect(confirm.hasAttribute("disabled")).toBe(true);
  expect(within(dialog).getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.click(confirm);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByRole("dialog", { name: "Delete group" })).not.toBeNull();
  expect(
    JSON.parse(fetch.mock.calls.find(([, init]) => init?.method === "DELETE")?.[1]?.body as string),
  ).toEqual({ version: groupRecord.version, deleteEvents: true });
  deleted = true;
  finish(new Response(JSON.stringify({ id: groupRecord.id, eventIds: [] })));
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/groups"));
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
});
it("keeps the deletion dialog on failure without navigation and permits safe cancellation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            init?.method === "DELETE" ? { error: "Internal server error" } : groupRecord,
          ),
          { status: init?.method === "DELETE" ? 500 : 200 },
        ),
    ),
  );
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Delete group" }));
  const dialog = await screen.findByRole("dialog", { name: "Delete group" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete group and events" }));
  expect(await within(dialog).findByText("Could not delete group")).not.toBeNull();
  expect(navigation.replace).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog", { name: "Delete group" })).toBeNull();
  expect(screen.queryByText("Could not update group membership")).toBeNull();
});
