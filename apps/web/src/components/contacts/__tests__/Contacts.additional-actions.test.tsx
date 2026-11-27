import { notificationAttentionTargetSchema } from "@board-game-organizer/schemas";
import {
  type ContactUser,
  clearSessionQueryCache,
  type RelationshipListType,
  type RelationshipRow,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { renderWithI18n } from "@/test-utils";
import { Contacts } from "../Contacts";

const auth = vi.hoisted(() => ({ getToken: vi.fn<() => Promise<string | null>>() }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "owner", getToken: auth.getToken }),
}));
const API = "https://contacts-additional-actions.test";
const at = "2030-06-01T12:00:00.000Z";
const summary = {
  tables: 0,
  events: 0,
  groups: 0,
  contacts: 0,
  sections: { connections: 0, requests: 0, search: 0 },
};
const person = (id = "target", flags: Partial<ContactUser> = {}): ContactUser => ({
  id,
  name: id === "target" ? "Target Player" : `Player ${id}`,
  username: `handle-${id}`,
  email: null,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: at },
  ...flags,
});
const scenarios = [
  { action: "Follow", source: "device", flags: {} },
  { action: "Unfollow", source: "following", flags: { isFollowing: true } },
  {
    action: "Remove friend",
    source: "friends",
    flags: { isFriend: true, isFollowing: true, isFollower: true },
    confirmation: "Remove friend?",
    confirm: "Remove friend",
  },
  {
    action: "Send friend request",
    source: "device",
    flags: {},
    confirmation: "Send friend request?",
    confirm: "Send request",
  },
  {
    action: "Cancel friend request",
    source: "sent",
    flags: {},
    confirmation: "Cancel friend request?",
    confirm: "Cancel request",
  },
  {
    action: "Accept friend request",
    source: "pending",
    flags: {},
    confirmation: "Accept friend request?",
    confirm: "Accept",
  },
  {
    action: "Decline friend request",
    source: "pending",
    flags: {},
    confirmation: "Decline friend request?",
    confirm: "Decline",
  },
  {
    action: "Block",
    source: "device",
    flags: {},
    confirmation: "Block contact",
    confirm: "Block",
  },
  {
    action: "Unblock",
    source: "blocked",
    flags: { blockedByMe: true },
    confirmation: "Unblock contact?",
    confirm: "Unblock",
  },
] as const;
let client: QueryClient;
let target: ContactUser;
let actionStatus: number, searchStatus: number;
let pendingAction: Promise<Response> | undefined;
let nextSearchPage: (() => Promise<Response>) | undefined;
let directoryRows: ContactUser[] | undefined;
let suggestions: ContactUser[];
const rows = new Map<RelationshipListType, RelationshipRow[]>();
const nextRows = new Map<RelationshipListType, RelationshipRow[]>();
const pageErrors = new Set<string>();
const reads: URL[] = [],
  writes: { url: URL; body: unknown; authorization: string | null }[] = [];
let intersections: ReturnType<typeof installBrowserIntersections>;
function relationship(type: RelationshipListType, profile: ContactUser) {
  const incoming = type === "pending" || type === "followers";
  return {
    fromUserId: incoming ? profile.id : "owner",
    toUserId: incoming ? "owner" : profile.id,
    profile,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.getToken.mockResolvedValue("fresh-additional-token");
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  target = person();
  actionStatus = searchStatus = 200;
  pendingAction = undefined;
  nextSearchPage = undefined;
  directoryRows = undefined;
  suggestions = [];
  rows.clear();
  nextRows.clear();
  pageErrors.clear();
  reads.length = writes.length = 0;
  intersections = installBrowserIntersections();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      const authorization = new Headers(init?.headers).get("authorization");
      expect(authorization).toBe("Bearer fresh-additional-token");
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/users/presence")
        return Response.json({ success: true, lastActiveAt: at });
      if (url.pathname === "/api/notifications/attention") {
        const targets = notificationAttentionTargetSchema
          .array()
          .parse(JSON.parse(url.searchParams.get("targets") ?? "[]"));
        return Response.json({
          asOf: at,
          unreadCount: 0,
          summary,
          targets: targets.map((target) => ({
            target,
            count: 0,
            direct: 0,
            events: 0,
            sections: summary.sections,
          })),
        });
      }
      if (
        (url.pathname === "/api/relationships" && method !== "GET") ||
        url.pathname.startsWith("/api/friend-requests/")
      ) {
        writes.push({ url, body: JSON.parse(String(init?.body)), authorization });
        if (pendingAction) return pendingAction;
        if (actionStatus === 200 && url.searchParams.get("type") === "follow") {
          target = { ...target, isFollowing: method === "POST" };
          rows.set("following", method === "POST" ? [relationship("following", target)] : []);
        }
        return Response.json(
          actionStatus === 200 ? { success: true } : { error: "Fixture relationship rejected" },
          { status: actionStatus },
        );
      }
      reads.push(url);
      if (url.pathname === "/api/relationships") {
        const type = url.searchParams.get("type");
        const kind = (
          ["friends", "following", "followers", "blocked", "pending", "sent"] as const
        ).find((value) => value === type);
        if (!kind) throw new Error(`Unexpected relationship category ${type}`);
        const selected: RelationshipListType = kind;
        const cursor = url.searchParams.get("cursor");
        const failed = Boolean(cursor && pageErrors.has(selected));
        const current = cursor ? (nextRows.get(selected) ?? []) : (rows.get(selected) ?? []);
        return Response.json(
          failed
            ? { error: "Fixture next page unavailable" }
            : {
                rows: current.map((row) =>
                  row.profile?.id === target.id ? { ...row, profile: target } : row,
                ),
                nextCursor: !cursor && nextRows.has(selected) ? `next-${selected}` : null,
              },
          { status: failed ? 400 : 200 },
        );
      }
      if (url.pathname === "/api/users/suggestions") {
        const cursor = url.searchParams.get("cursor");
        const failed = Boolean(cursor && pageErrors.has("suggestions"));
        return Response.json(
          failed
            ? { error: "Suggestions unavailable" }
            : {
                users: cursor
                  ? [person("later")]
                  : suggestions.map((value) => (value.id === target.id ? target : value)),
                hasContacts: true,
                nextCursor: !cursor && pageErrors.has("suggestions") ? "next-suggestions" : null,
              },
          { status: failed ? 400 : 200 },
        );
      }
      if (url.pathname === "/api/users/search") {
        if (url.searchParams.get("cursor") && nextSearchPage) return nextSearchPage();
        return Response.json(
          searchStatus !== 200
            ? { error: "Search unavailable" }
            : {
                users:
                  url.searchParams.get("query") === "nobody"
                    ? []
                    : (directoryRows ?? [person("search-result", { username: null })]),
                nextCursor: nextSearchPage ? "next-directory-result" : null,
              },
          { status: searchStatus },
        );
      }
      throw new Error(`Unexpected Contacts request: ${method} ${url.pathname}`);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function mount() {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <Contacts />
    </QueryClientProvider>,
  );
}
async function openActions(name = "Target Player") {
  const label = await screen.findByText(name);
  const row = label.closest("li");
  if (!(row instanceof HTMLElement)) throw new Error("Expected actual contact row");
  fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
}
function tab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

it.each(scenarios)(
  "keeps a failed $action observable, rolls back its owned projection and leaves the same action retryable",
  async (scenario) => {
    actionStatus = 400;
    target = person("target", scenario.flags);
    if (scenario.source === "device") suggestions = [target];
    else rows.set(scenario.source, [relationship(scenario.source, target)]);
    mount();
    tab(
      scenario.source === "device"
        ? "Search"
        : scenario.source === "pending" || scenario.source === "sent"
          ? "Requests"
          : "Connections",
    );
    await openActions();
    fireEvent.click(await screen.findByRole("menuitem", { name: scenario.action }));
    if ("confirmation" in scenario) {
      const dialog = await screen.findByRole("dialog", { name: scenario.confirmation });
      fireEvent.click(within(dialog).getByRole("button", { name: scenario.confirm }));
    }
    expect(await screen.findByText("Could not complete the action. Try again.")).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0].authorization).toBe("Bearer fresh-additional-token");
    await openActions();
    expect(await screen.findByRole("menuitem", { name: scenario.action })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    if (scenario.action === "Follow") {
      actionStatus = 200;
      fireEvent.click(screen.getByRole("menuitem", { name: scenario.action }));
      await waitFor(() => expect(writes).toHaveLength(2));
      await waitFor(() =>
        expect(screen.queryByText("Could not complete the action. Try again.")).toBeNull(),
      );
    }
  },
);

it("disables only the pending user's real menu actions and leaves another contact usable", async () => {
  let finish: (response: Response) => void = () => {};
  pendingAction = new Promise((resolve) => {
    finish = resolve;
  });
  // Following a friend preserves the selected Connections row. Device
  // suggestions correctly disappear as soon as their connection is projected.
  target = person("target", { isFriend: true });
  rows.set("friends", [
    relationship("friends", target),
    relationship("friends", person("other", { isFriend: true })),
  ]);
  mount();
  await openActions();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Follow" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  await openActions();
  expect(await screen.findByRole("menuitem", { name: "Unfollow" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByRole("menuitem", { name: "Block" })).toHaveAttribute("aria-disabled", "true");
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await openActions("Player other");
  expect(await screen.findByRole("menuitem", { name: "Follow" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  target = { ...target, isFollowing: true };
  pendingAction = undefined;
  await act(async () => finish(Response.json({ success: true })));
  expect(writes).toHaveLength(1);
});

it.each(["friends", "following", "pending", "sent"] as const)(
  "retains %s rows across a real next-page failure and retries its own cursor",
  async (type) => {
    target = person(
      "target",
      type === "friends" ? { isFriend: true } : type === "following" ? { isFollowing: true } : {},
    );
    rows.set(type, [relationship(type, target)]);
    nextRows.set(type, [
      relationship(
        type,
        person(
          "later",
          type === "friends"
            ? { isFriend: true }
            : type === "following"
              ? { isFollowing: true }
              : {},
        ),
      ),
    ]);
    pageErrors.add(type);
    mount();
    tab(type === "pending" || type === "sent" ? "Requests" : "Connections");
    await screen.findByText("Target Player");
    await waitFor(() => expect(intersections.observedTargetCount).toBeGreaterThan(0));
    await act(async () => intersections.intersect());
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByText("Target Player")).toBeVisible();
    pageErrors.delete(type);
    fireEvent.click(retry);
    expect(await screen.findByText("Player later")).toBeVisible();
    expect(
      reads
        .filter(
          (url) => url.pathname === "/api/relationships" && url.searchParams.get("type") === type,
        )
        .map((url) => url.searchParams.get("cursor")),
    ).toEqual([null, `next-${type}`, `next-${type}`]);
  },
);

it("retains device suggestions through a failed page and explicitly retries the next cursor", async () => {
  suggestions = [target];
  pageErrors.add("suggestions");
  mount();
  tab("Search");
  await screen.findByText("Target Player");
  await waitFor(() => expect(intersections.observedTargetCount).toBeGreaterThan(0));
  await act(async () => intersections.intersect());
  const retry = await screen.findByRole("button", { name: "Retry" });
  expect(screen.getByText("Target Player")).toBeVisible();
  pageErrors.delete("suggestions");
  fireEvent.click(retry);
  expect(await screen.findByText("Player later")).toBeVisible();
  expect(
    reads
      .filter((url) => url.pathname === "/api/users/suggestions")
      .map((url) => url.searchParams.get("cursor")),
  ).toEqual([null, "next-suggestions", "next-suggestions"]);
});

it("keeps failed search distinct from empty, clears the failed scope and searches again with the actual input", async () => {
  searchStatus = 400;
  mount();
  tab("Search");
  const input = screen.getByPlaceholderText("Search users");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "missing" } });
  expect(await screen.findByText("Could not load contacts")).toBeVisible();
  expect(screen.queryByText("No users found")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByText("Type at least 4 characters to search")).toBeVisible();
  searchStatus = 200;
  fireEvent.change(input, { target: { value: "nobody" } });
  expect(await screen.findByText("No users found")).toBeVisible();
  fireEvent.change(input, { target: { value: "another" } });
  expect(await screen.findByText("Player search-result")).toBeVisible();
  expect(screen.queryByText("@handle-search-result")).toBeNull();
});

it("keeps directory results visible when the next page fails and retries the same cursor", async () => {
  let finish: ((page: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  nextSearchPage = vi
    .fn()
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce(Response.json({ users: [person("next-result")], nextCursor: null }));
  mount();
  tab("Search");
  const input = screen.getByRole("searchbox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "@handle" } });
  expect(await screen.findByText("Player search-result")).toBeVisible();
  await waitFor(() => expect(intersections.observedTargetCount).toBeGreaterThan(0));
  await act(async () => intersections.intersect());
  await waitFor(() => expect(nextSearchPage).toHaveBeenCalledOnce());
  expect(screen.getByText("Player search-result")).toBeVisible();
  await act(async () => finish?.(Response.json({ error: "Page unavailable" }, { status: 503 })));
  const retry = await screen.findByRole("button", { name: "Retry" });
  expect(screen.queryByText("Could not load contacts")).toBeNull();
  fireEvent.click(retry);
  expect(await screen.findByText("Player next-result")).toBeVisible();
  expect(screen.getByText("Player search-result")).toBeVisible();
  expect(
    reads
      .filter((url) => url.pathname === "/api/users/search")
      .map((url) => url.searchParams.get("cursor")),
  ).toEqual([null, "next-directory-result", "next-directory-result"]);
});

it("shows only new contacts in the synced list and directory during a stale relationship response", async () => {
  const incoming = person("incoming");
  const outgoing = person("outgoing");
  const follower = person("follower");
  const unrelated = person("new-contact");
  suggestions = directoryRows = [incoming, outgoing, follower, unrelated];
  rows.set("pending", [relationship("pending", incoming)]);
  rows.set("sent", [relationship("sent", outgoing)]);
  rows.set("followers", [relationship("followers", follower)]);
  mount();
  expect(await screen.findByText("Player follower")).toBeVisible();
  tab("Requests");
  expect(await screen.findByText("Player incoming")).toBeVisible();
  expect(screen.getByText("Player outgoing")).toBeVisible();
  tab("Search");
  expect(await screen.findByText("Player new-contact")).toBeVisible();
  const hidden = ["incoming", "outgoing", "follower"];
  for (const id of hidden) expect(screen.queryByText(`Player ${id}`)).toBeNull();
  const input = screen.getByRole("searchbox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Player" } });
  expect(await screen.findByText("Player new-contact")).toBeVisible();
  for (const id of hidden) expect(screen.queryByText(`Player ${id}`)).toBeNull();
  expect(reads.find((url) => url.pathname === "/api/users/search")?.searchParams.get("scope")).toBe(
    "discovery",
  );
});
