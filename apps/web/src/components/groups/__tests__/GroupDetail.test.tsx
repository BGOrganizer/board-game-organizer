import { groupRecordKeys } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import GroupBanPage from "@/app/(tabs)/groups/[groupId]/ban/page";
import GroupPage from "@/app/(tabs)/groups/[groupId]/page";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { messages as italian } from "../../../../../../messages/it.js";
import { GroupDetail } from "../GroupDetail";

function contactReadResponse(url: string, init?: RequestInit) {
  if ((init?.method ?? "GET") !== "GET") return;
  const path = new URL(url).pathname;
  if (path === "/api/relationships") return Response.json({ rows: [], nextCursor: null });
  if (path === "/api/users/suggestions")
    return Response.json({ users: [], hasContacts: false, nextCursor: null });
}

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "guest",
    getToken: async () => "fresh",
    feedback: navigation.feedback,
  }),
}));
const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn(), onSuccess: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ ...navigation, push: vi.fn(), back: vi.fn() }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function mount(
  initialTab: "info" | "members" | "events" = "info",
  content: ReactElement = <GroupDetail groupId={groupRecord.id} initialTab={initialTab} />,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  renderWithI18n(
    <>
      <header data-testid="app-header"></header>
      <QueryClientProvider client={client}>{content}</QueryClientProvider>
    </>,
  );
  return client;
}
it("explains the three authorized group sections and moves the venue help into Details", async () => {
  const group = { ...groupRecord, type: "PUBLIC", location: plannedEvent.locations[0] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const contacts = contactReadResponse(url, init);
      if (contacts) return contacts;
      const path = new URL(url).pathname;
      return Response.json(path.endsWith(group.id) ? group : { items: [], nextCursor: null });
    }),
  );
  mount();
  expect(await screen.findByRole("heading", { name: "Group venue" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Group venue help" })).toBeNull();
  for (const [tab, button, description] of [
    ["Details", "Group details help", "The group's verified venue and full address."],
    [
      "Members",
      "Group members help",
      "Group managers can invite people and review membership requests.",
    ],
    [
      "Events",
      "Group events help",
      "Public events are open to everyone with an account. Private events are for group members.",
    ],
  ]) {
    fireEvent.click(screen.getByRole("tab", { name: tab }));
    expect(screen.getByRole("heading", { name: tab })).toBeVisible();
    expect(screen.queryByText(description)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: button }));
    const help = await screen.findByRole("dialog");
    expect(within(help).getByText(description)).toBeVisible();
    fireEvent.keyDown(help, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }
});

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
    vi.fn(async (url: string, init?: RequestInit) => {
      const contacts = contactReadResponse(url, init);
      if (contacts) return contacts;
      return new Response(
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
      );
    }),
  );
  mount();
  expect(await screen.findByRole("button", { name: "Accept" })).not.toBeNull();
  const accept = screen.getByRole("button", { name: "Accept" }),
    decline = screen.getByRole("button", { name: "Decline" });
  expect(accept.closest(".max-w-md")?.className).toContain("mx-auto");
  expect(screen.getByRole("tabpanel").lastElementChild?.contains(accept.closest(".max-w-md"))).toBe(
    true,
  );
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
  expect(strip?.classList.contains("mt-2")).toBe(true);
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
    vi.fn(async (url: string, init?: RequestInit) => {
      const contacts = contactReadResponse(url, init);
      if (contacts) return contacts;
      return new Response(
        JSON.stringify(url.includes("/events") ? { items: [], nextCursor: null } : groupRecord),
      );
    }),
  );
  mount("events");
  await screen.findByRole("tab", { name: "Events", selected: true });
  const search = screen.getByRole("searchbox", { name: "Filter" });
  expect(screen.queryByRole("button", { name: "Planning", pressed: true })).toBeNull();
  expect(screen.getByRole("button", { name: "Sort by Date" })).toBeVisible();
  fireEvent.focus(search);
  expect(screen.queryByRole("tablist", { name: "Group sections" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  expect(screen.queryByRole("heading", { name: groupRecord.name })).toBeNull();
  expect(screen.getByRole("button", { name: "Planning", pressed: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Sort by Date" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "Name" }));
  expect(await screen.findByRole("button", { name: "Sort by Name" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("button", { name: "Sort by Name" })).toBeVisible();
  expect(screen.getByRole("searchbox", { name: "Filter" })).toBe(search);
  expect(screen.getByRole("tab", { name: "Events", selected: true })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back" })).toBeVisible();
});
it("keeps accepted member departure in the danger page action and preserves explicit confirmation", async () => {
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
    const contacts = contactReadResponse(_url, init);
    if (contacts) return contacts;

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
  expect(leave.closest("header")).toBeNull();
  expect(
    leave.closest("[data-page-toolbar]")?.contains(screen.getByRole("link", { name: "Back" })),
  ).toBe(true);
  expect(leave.querySelector("svg.lucide-log-out")).not.toBeNull();
  expect(leave.closest("[data-page-toolbar]")?.parentElement).toHaveClass("space-y-4");
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
      const contacts = contactReadResponse(_url, init);
      if (contacts) return contacts;

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
    const contacts = contactReadResponse(url, init);
    if (contacts) return contacts;

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
  fireEvent.click(screen.getByRole("tab", { name: "Details" }));
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
it("requires explicit cascade confirmation, then closes and navigates before DELETE without permitting repeat submission", async () => {
  let finish!: (value: Response) => void;
  let deleted = false;
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const contacts = contactReadResponse(_url, init);
    if (contacts) return contacts;

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
  expect(button.closest("header")).toBeNull();
  expect(
    button.closest("[data-page-toolbar]")?.contains(screen.getByRole("link", { name: "Back" })),
  ).toBe(true);
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
  expect(screen.queryByRole("dialog", { name: "Delete group" })).toBeNull();
  expect(navigation.replace).toHaveBeenCalledWith("/groups");
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(navigation.feedback.onOptimisticUpdate).toHaveBeenCalledWith("delete_group");
  expect(
    JSON.parse(fetch.mock.calls.find(([, init]) => init?.method === "DELETE")?.[1]?.body as string),
  ).toEqual({ version: groupRecord.version, deleteEvents: true });
  deleted = true;
  finish(new Response(JSON.stringify({ id: groupRecord.id, eventIds: [] })));
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/groups"));
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
});
it("reports a definite deletion rejection after immediate navigation and restores only its removed list row", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const contacts = contactReadResponse(_url, init);
      if (contacts) return contacts;
      return new Response(
        JSON.stringify(init?.method === "DELETE" ? { error: "GROUP_CHANGED" } : groupRecord),
        { status: init?.method === "DELETE" ? 409 : 200 },
      );
    }),
  );
  const client = mount();
  const key = groupRecordKeys.list({ apiUrl: "https://api.test", userId: "guest" }, "mine");
  const previous = { pages: [{ items: [groupRecord], nextCursor: null }], pageParams: [""] };
  client.setQueryData(key, previous);
  fireEvent.click(await screen.findByRole("button", { name: "Delete group" }));
  const dialog = await screen.findByRole("dialog", { name: "Delete group" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete group and events" }));
  expect(screen.queryByRole("dialog", { name: "Delete group" })).toBeNull();
  expect(navigation.replace).toHaveBeenCalledWith("/groups");
  await waitFor(() =>
    expect(navigation.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "delete_group"),
  );
  await waitFor(() => expect(client.getQueryData(key)).toEqual(previous));
  expect(navigation.feedback.onSuccess).not.toHaveBeenCalled();
});

it("loads the Group members from a moderation deep link after an explicit retry", async () => {
  const group = { ...groupRecord, pendingRequestCount: 1 };
  let denied = true;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const contacts = contactReadResponse(url, init);
    if (contacts) return contacts;
    const path = new URL(url).pathname;
    if (path === `/api/groups/${group.id}`) {
      return denied ? Response.json({ error: "FORBIDDEN" }, { status: 403 }) : Response.json(group);
    }
    return Response.json({ items: [], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetcher);
  mount("members", await GroupBanPage({ params: Promise.resolve({ groupId: group.id }) }));
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("Could not load group details");
  expect(screen.queryByText(group.name)).toBeNull();
  denied = false;
  fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("tab", { name: /Members/, selected: true })).toBeVisible();
  expect(screen.getByRole("img", { name: "Requests to review" })).toBeVisible();
  expect(
    fetcher.mock.calls.filter(([url]) => new URL(url).pathname === `/api/groups/${group.id}`),
  ).toHaveLength(2);
});

it("shows Details when a deep link asks for the Events tab on a group the viewer may not browse", async () => {
  const reads: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      reads.push(url);
      if (url.pathname === `/api/groups/${groupRecord.id}`)
        return Response.json({
          ...groupRecord,
          type: "PUBLIC",
          role: "none",
          canViewEvents: false,
          canViewRankings: false,
          canInvite: false,
          canEdit: false,
        });
      return contactReadResponse(input, init) ?? Response.json({ items: [], nextCursor: null });
    }),
  );
  mount("events");
  expect(await screen.findByRole("tab", { name: "Details", selected: true })).toBeVisible();
  expect(screen.queryByRole("tab", { name: "Events" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Rankings" })).toBeNull();
  expect(reads.some((url) => url.pathname === "/api/events")).toBe(false);
});

it("loads the Italian resource notifications on a localized Group detail", async () => {
  const fetchNotifications = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (url.pathname === `/api/groups/${groupRecord.id}`) return Response.json(groupRecord);
      if (url.pathname === "/api/notifications/changes") {
        fetchNotifications(url.searchParams.get("locale"), url.searchParams.get("id"));
        return Response.json({
          asOf: groupRecord.createdAt,
          changes: [],
          nextCursor: null,
          tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
        });
      }
      return contactReadResponse(input, init) ?? Response.json({ items: [], nextCursor: null });
    }),
  );
  const i18n = setupI18n({ locale: "it", messages: { it: italian } });
  mount(
    "info",
    <I18nProvider i18n={i18n}>
      <GroupDetail groupId={groupRecord.id} />
    </I18nProvider>,
  );
  await waitFor(() => expect(fetchNotifications).toHaveBeenCalledWith("it", groupRecord.id));
  expect(fetchNotifications).not.toHaveBeenCalledWith("en", groupRecord.id);
  expect(await screen.findByRole("tab", { name: "Dettagli", selected: true })).toBeVisible();
});

it("falls back to Details for a direct Group link with an unsupported tab", async () => {
  const reads: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      reads.push(url);
      if (url.pathname === `/api/groups/${groupRecord.id}`) return Response.json(groupRecord);
      return contactReadResponse(input, init) ?? Response.json({ items: [], nextCursor: null });
    }),
  );
  mount(
    "info",
    await GroupPage({
      params: Promise.resolve({ groupId: groupRecord.id }),
      searchParams: Promise.resolve({ tab: "unknown" }),
    }),
  );
  expect(await screen.findByRole("tab", { name: "Details", selected: true })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Events", selected: false })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Members", selected: false })).toBeVisible();
  expect(reads.some((url) => url.pathname.endsWith("/members"))).toBe(false);
  expect(reads.some((url) => url.pathname === "/api/events")).toBe(false);
});
