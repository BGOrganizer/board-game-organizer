// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { messages } from "../../../../messages/en.js";
import { PeopleResults, supportsPeopleResult } from "./PeopleResults";
import type { ToolOutput } from "./protocol";
import { WidgetNavigation } from "./WidgetNavigation";

const handle = "user_same";
const date = "2026-11-22T20:08:00.000Z";
const first = "507f1f77bcf86cd799439011";
const second = "507f1f77bcf86cd799439012";
const groupId = "7505cc33-1877-4537-8164-0492b4e2df40";
const one = {
  id: handle,
  name: "Avery",
  username: "avery",
  avatarUrl: null,
  email: "invisible@example.test",
};
const visibleProfile = {
  ...one,
  social: { friends: 2, following: 3, followers: 4 },
  player: { gamesPlayed: 1, gamesWon: 0, winRate: 0 },
};
const game = { id: 391, name: "A game", imageUrl: null };
const services = { callServerTool: vi.fn(), openLink: vi.fn() };
const app = services as unknown as App;
const result = (operation: string, data: unknown) => ({ structuredContent: { operation, data } });
const notification = {
  id: first,
  createdAt: date,
  readAt: null,
  title: "Game night",
  description: "Your venue has changed.",
  href: "/contacts",
  kind: "follow",
};

beforeEach(() => {
  services.callServerTool.mockReset();
  services.openLink.mockReset().mockResolvedValue({});
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open(operation: string, data: unknown, input?: unknown, navigation = false) {
  const i18n = setupI18n({ locale: "en", messages: { en: messages } });
  const query = new QueryClient({
    defaultOptions: { queries: { ...(navigation ? {} : { gcTime: 0 }), retry: false } },
  });
  const output = { operation, data, viewerUserId: "user_current" };
  const renderPeople = (destination: ToolOutput, destinationInput: unknown) => (
    <PeopleResults app={app} {...destination} input={destinationInput} />
  );
  return render(
    <QueryClientProvider client={query}>
      <I18nProvider i18n={i18n}>
        {navigation ? (
          <WidgetNavigation app={app} output={output} input={input} render={renderPeople} />
        ) : (
          renderPeople(output, input)
        )}
      </I18nProvider>
    </QueryClientProvider>,
  );
}

it("opens a contact in the widget and can return before changing to another contact list", async () => {
  services.callServerTool
    .mockResolvedValueOnce(result("get_user_profile", visibleProfile))
    .mockResolvedValueOnce(result("list_relationships", { rows: [], nextCursor: null }));
  open("list_friends", { rows: [{ profile: one }], nextCursor: null }, undefined, true);

  fireEvent.click(screen.getByRole("button", { name: "Avery" }));
  expect(await screen.findByRole("heading", { name: "Profile" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByRole("button", { name: "Avery" })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Friends" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Following" }));
  expect(await screen.findByRole("button", { name: "Following" })).toBeVisible();
  expect(services.callServerTool.mock.calls.map(([input]) => input)).toEqual([
    { name: "get_user_profile", arguments: { params: { userId: handle } } },
    { name: "list_relationships", arguments: { query: { type: "following" } } },
  ]);
  expect(services.openLink).not.toHaveBeenCalled();
});

it("navigates through a profile's activities, ratings, and published collection without leaving the widget", async () => {
  services.callServerTool
    .mockResolvedValueOnce(result("list_profile_activity", { items: [], nextCursor: null }))
    .mockResolvedValueOnce(result("list_profile_games", { items: [game], nextCursor: null }))
    .mockResolvedValueOnce(result("list_bgg_collection", { items: [], nextCursor: null }));
  open(
    "get_user_profile",
    { ...visibleProfile, collection: { snapshot: "published" } },
    undefined,
    true,
  );

  fireEvent.click(screen.getByRole("button", { name: "Activities" }));
  expect(await screen.findByText("No activities yet")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(await screen.findByRole("button", { name: "OpenSkill statistics" }));
  expect(await screen.findByRole("heading", { name: "OpenSkill statistics" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(await screen.findByRole("button", { name: "Collection" }));

  await waitFor(() =>
    expect(services.callServerTool.mock.calls.map(([input]) => input)).toEqual([
      { name: "list_profile_activity", arguments: { params: { userId: handle } } },
      { name: "list_profile_games", arguments: { params: { userId: handle } } },
      {
        name: "list_bgg_collection",
        arguments: { query: { subjectId: handle, snapshot: "published" } },
      },
    ]),
  );
  expect(services.openLink).not.toHaveBeenCalled();
});

it("keeps a Community activity's links and global rankings within the widget", async () => {
  services.callServerTool
    .mockResolvedValueOnce(result("get_user_profile", visibleProfile))
    .mockResolvedValueOnce(result("list_global_leaderboard", { games: [] }));
  open(
    "list_community_activity",
    {
      items: [
        {
          id: "activity",
          kind: "group_join",
          occurredAt: date,
          context: "Friendly games",
          href: `/groups/${groupId}`,
          author: one,
        },
      ],
      nextCursor: null,
    },
    undefined,
    true,
  );

  fireEvent.click(screen.getByRole("button", { name: "avery" }));
  expect(await screen.findByRole("heading", { name: "Profile" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(await screen.findByRole("button", { name: "Rankings" }));
  await waitFor(() =>
    expect(services.callServerTool.mock.calls.map(([input]) => input)).toEqual([
      { name: "get_user_profile", arguments: { params: { userId: handle } } },
      { name: "list_global_leaderboard", arguments: {} },
    ]),
  );
  expect(services.openLink).not.toHaveBeenCalled();
});

it.each([false, true])("reads an eligible notice after navigation (retry: %s)", async (retry) => {
  if (retry) services.callServerTool.mockResolvedValueOnce({ isError: true });
  const loadFollowers = { name: "list_relationships", arguments: { query: { type: "followers" } } };
  services.callServerTool
    .mockResolvedValueOnce(
      result("list_relationships", { rows: [{ profile: one }], nextCursor: null }),
    )
    .mockResolvedValueOnce(result("mark_notification_read", { success: true }))
    .mockResolvedValueOnce(
      result("list_notifications", {
        notifications: [{ ...notification, readAt: date }],
        unreadCount: 0,
        nextCursor: null,
      }),
    );
  open(
    "list_notifications",
    { notifications: [notification], unreadCount: 1, nextCursor: null },
    undefined,
    true,
  );

  fireEvent.click(screen.getByRole("button", { name: /Game night/ }));
  if (retry) {
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(services.callServerTool.mock.calls.map(([input]) => input)).toEqual([loadFollowers]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  }
  expect(await screen.findByRole("button", { name: "Followers" })).toBeVisible();
  await waitFor(() =>
    expect(services.callServerTool.mock.calls.map(([input]) => input)).toEqual([
      ...(retry ? [loadFollowers] : []),
      loadFollowers,
      { name: "mark_notification_read", arguments: { params: { notificationId: first } } },
      { name: "list_notifications", arguments: {} },
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByText("Game night")).toBeVisible();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull());
  expect(services.openLink).not.toHaveBeenCalled();
});

it("opens a group invitation in the widget without reading it or answering on the user's behalf", async () => {
  services.callServerTool.mockResolvedValueOnce(result("get_group", { id: groupId }));
  open(
    "list_notifications",
    {
      notifications: [{ ...notification, kind: "group_invitation", href: `/groups/${groupId}` }],
      unreadCount: 1,
      nextCursor: null,
    },
    undefined,
    true,
  );

  fireEvent.click(screen.getByRole("button", { name: /Game night/ }));
  await waitFor(() =>
    expect(services.callServerTool).toHaveBeenCalledWith(
      { name: "get_group", arguments: { params: { groupId } } },
      { signal: expect.any(AbortSignal) },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByText("Game night")).toBeVisible();
  expect(services.callServerTool).toHaveBeenCalledTimes(1);
  expect(services.openLink).not.toHaveBeenCalled();
});

it("opens registered roster profiles inside the widget and leaves guests as plain identities", async () => {
  services.callServerTool.mockResolvedValueOnce(result("get_user_profile", visibleProfile));
  open(
    "list_table_seats",
    {
      items: [
        { id: "seat-one", userId: handle, name: "Avery", username: "avery", kind: "REGISTERED" },
        { id: "seat-guest", userId: "guest", name: "Casey", guestName: "casey", kind: "GUEST" },
      ],
      nextCursor: null,
    },
    undefined,
    true,
  );

  expect(screen.getByText("@casey")).toBeVisible();
  expect(screen.queryByRole("button", { name: "@casey" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "@avery" }));
  expect(await screen.findByRole("heading", { name: "Profile" })).toBeVisible();
  expect(services.callServerTool).toHaveBeenCalledWith(
    { name: "get_user_profile", arguments: { params: { userId: handle } } },
    { signal: expect.any(AbortSignal) },
  );
  expect(services.openLink).not.toHaveBeenCalled();
});

it("registers the people tool outputs and leaves unrelated operations to their own views", () => {
  expect(supportsPeopleResult("list_table_seats")).toBe(true);
  expect(supportsPeopleResult("list_events")).toBe(false);
  expect(open("list_events", {}).container).toBeEmptyDOMElement();
});

it("renders real BGO contact rows and loads only the next page with the same search arguments", async () => {
  services.callServerTool.mockResolvedValue(
    result("search_users", {
      users: [{ ...one, id: "user_new", name: "Blake", username: "blake" }],
      nextCursor: null,
    }),
  );
  open(
    "search_users",
    {
      users: [{ ...one, isFriend: true, isFollowing: true, presence: { online: true } }],
      nextCursor: handle,
    },
    { query: { query: "test", limit: 5 } },
  );
  expect(screen.getByText("@avery")).toBeVisible();
  expect(screen.getByRole("img", { name: "Online" })).toBeVisible();
  expect(screen.queryByText(one.email)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("@blake")).toBeVisible();
  expect(services.callServerTool).toHaveBeenCalledWith(
    { name: "search_users", arguments: { query: { query: "test", limit: 5, cursor: handle } } },
    { signal: expect.any(AbortSignal) },
  );
});

it("lets a user accept a real incoming friend request through the shared BGO menu dialog", async () => {
  services.callServerTool
    .mockResolvedValueOnce(result("respond_to_friend_request", { success: true }))
    .mockResolvedValueOnce(result("list_friend_requests", []));
  open("list_friend_requests", [{ profile: one }, { profile: null }], {
    query: { direction: "incoming" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Accept friend request" }));
  const dialog = await screen.findByRole("dialog", { name: "Accept friend request?" });
  expect(services.callServerTool).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Accept" }));
  expect(await screen.findByText("No users found")).toBeVisible();
  expect(services.callServerTool).toHaveBeenNthCalledWith(
    1,
    {
      name: "respond_to_friend_request",
      arguments: { params: { targetUserId: handle }, body: { decision: "accept" } },
    },
    { signal: undefined },
  );
});

it("opens the selected profile through the host and follows through the same menu on explicit press", async () => {
  services.callServerTool
    .mockResolvedValueOnce(result("follow_user", { success: true }))
    .mockResolvedValueOnce(
      result("list_relationships", {
        rows: [{ profile: { ...one, isFollowing: true } }],
        nextCursor: null,
      }),
    );
  open(
    "list_relationships",
    { rows: [{ profile: one }], nextCursor: null },
    { query: { type: "followers" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "View profile" }));
  await waitFor(() =>
    expect(services.openLink).toHaveBeenCalledWith({
      url: expect.stringMatching(/\/profiles\/user_same$/),
    }),
  );
  expect(services.callServerTool).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Follow" }));
  await waitFor(() =>
    expect(services.callServerTool).toHaveBeenCalledWith(
      { name: "follow_user", arguments: { params: { targetUserId: handle } } },
      { signal: undefined },
    ),
  );
});

it("displays the profile identity and stats, including an unknown win percentage", () => {
  open("get_my_profile", {
    ...one,
    social: { friends: 4, followers: 6, following: 3 },
    player: { gamesPlayed: 0, gamesWon: 0, winRate: null },
  });
  expect(screen.getByText("Avery")).toBeVisible();
  expect(screen.getByText("@avery")).toBeVisible();
  expect(screen.getByText("Win percentage")).toBeVisible();
  expect(screen.getByText("—")).toBeVisible();
  expect(screen.queryByText(one.email)).toBeNull();
});

it("renders authorized BGO activity narratives and delegates resource links to the host", async () => {
  open("list_community_activity", {
    items: [
      {
        id: "activity",
        kind: "group_join",
        occurredAt: date,
        context: "Friendly games",
        href: `/groups/${groupId}`,
        author: one,
      },
    ],
    nextCursor: null,
  });
  expect(screen.getByRole("button", { name: "avery" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Friendly games" }));
  await waitFor(() =>
    expect(services.openLink).toHaveBeenCalledWith({
      url: expect.stringContaining(`/groups/${groupId}`),
    }),
  );
});

it("renders a real rating history chart and keeps the game ID when requesting older points", async () => {
  const input = { params: { userId: handle, gameId: "391" } };
  const base = {
    game,
    rating: 499,
    delta: 12,
    stats: { gamesPlayed: 3, gamesWon: 1, winRate: 33.3 },
  };
  services.callServerTool.mockResolvedValue(
    result("get_profile_game_history", {
      ...base,
      points: [{ ordinal: 1, rating: 480, delta: -12 }],
      nextCursor: null,
    }),
  );
  open(
    "get_profile_game_history",
    {
      ...base,
      points: [
        { ordinal: 2, rating: 487, delta: 7 },
        { ordinal: 3, rating: 499, delta: 12 },
      ],
      nextCursor: 2,
    },
    input,
  );
  expect(screen.getByRole("img", { name: "OpenSkill rating history" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(services.callServerTool).toHaveBeenCalledWith(
      { name: "get_profile_game_history", arguments: { ...input, query: { cursor: 2 } } },
      { signal: expect.any(AbortSignal) },
    ),
  );
});

it("preserves invitation consent when opening the shared notification card", async () => {
  open("list_notifications", {
    notifications: [{ ...notification, kind: "group_invitation", href: `/groups/${groupId}` }],
    unreadCount: 1,
    nextCursor: null,
  });
  expect(screen.getByText(notification.description)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Game night/ }));
  await waitFor(() => expect(services.openLink).toHaveBeenCalled());
  expect(services.callServerTool).not.toHaveBeenCalled();
});

it("marks a read-eligible notification after opening and requires explicit confirmation for deletion", async () => {
  const read = { ...notification, readAt: date };
  services.callServerTool
    .mockResolvedValueOnce(result("mark_notification_read", { success: true }))
    .mockResolvedValueOnce(
      result("list_notifications", { notifications: [read], unreadCount: 0, nextCursor: null }),
    )
    .mockResolvedValueOnce(result("delete_notification", { success: true }))
    .mockResolvedValueOnce(
      result("list_notifications", { notifications: [], unreadCount: 0, nextCursor: null }),
    );
  open("list_notifications", { notifications: [notification], unreadCount: 1, nextCursor: null });
  fireEvent.click(screen.getByRole("button", { name: /Game night/ }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Delete notification" }));
  const dialog = await screen.findByRole("dialog", { name: "Delete notification?" });
  expect(services.callServerTool).toHaveBeenCalledTimes(2);
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete notification" }));
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(services.callServerTool).toHaveBeenNthCalledWith(
    3,
    { name: "delete_notification", arguments: { params: { notificationId: first } } },
    { signal: undefined },
  );
});

it("preserves the original notification query and refuses to open a foreign target", async () => {
  const query = { locale: "it", limit: 2 };
  services.callServerTool.mockResolvedValue(
    result("list_notifications", {
      notifications: [{ ...notification, id: second, title: "Second item" }],
      unreadCount: 2,
      nextCursor: null,
    }),
  );
  open(
    "list_notifications",
    {
      notifications: [{ ...notification, href: "//elsewhere.example/services" }],
      unreadCount: 2,
      nextCursor: first,
    },
    { query },
  );
  expect(screen.queryByRole("button", { name: /Game night/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Second item")).toBeVisible();
  expect(services.callServerTool).toHaveBeenCalledWith(
    { name: "list_notifications", arguments: { query: { ...query, cursor: first } } },
    { signal: expect.any(AbortSignal) },
  );
});

it("shows authorized notification changes without inventing an acknowledgment", () => {
  const reference = { notificationId: first, effectiveAt: date };
  open("list_notification_changes", {
    changes: [
      {
        ...reference,
        title: "Invitation",
        description: "You have been invited.",
        messageCode: "invitation",
        requiresResponse: true,
        readReference: reference,
      },
    ],
    asOf: date,
    tabCounts: { details: 0, members: 1, tables: 0, participants: 0 },
    nextCursor: null,
  });
  expect(screen.getByText("You have been invited.")).toBeVisible();
  expect(screen.getByText("Invitations remain unread until you respond.")).toBeVisible();
  expect(services.callServerTool).not.toHaveBeenCalled();
});

it.each([
  [
    "list_group_members",
    { userId: handle, name: "Avery", username: "avery", isAdmin: true, membership: null },
    "Admin",
  ],
  [
    "list_event_participants",
    { ...one, managementRole: "moderator", accepted: false },
    "Moderator",
  ],
  [
    "list_table_seats",
    {
      id: "seat",
      userId: "guest",
      name: "Avery",
      guestName: "avery",
      kind: "GUEST",
      position: "SEATED",
      status: "ACCEPTED",
    },
    "Guest",
  ],
  ["list_group_invitees", one, "Confirmed player"],
])("renders the authorized identities and BGO badges for %s", (operation, item, label) => {
  open(operation, { items: [item], nextCursor: null });
  expect(screen.getByText("@avery")).toBeVisible();
  if (operation === "list_group_invitees") expect(screen.queryByText(label)).toBeNull();
  else expect(screen.getByText(label)).toBeVisible();
});

it.each([
  ["search_users", "Could not load users"],
  ["list_notifications", "Could not load notifications"],
  ["list_notification_changes", "Could not load changes. Try again."],
  ["list_profile_activity", "Could not load activities"],
  ["get_user_profile", "Could not load profile"],
  ["get_profile_game_history", "Could not load rating history"],
  ["list_group_members", "Could not load participants"],
])("shows a failure instead of an empty success for malformed %s data", (operation, message) => {
  open(operation, null);
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(services.callServerTool).not.toHaveBeenCalled();
});

it("pages the profile game picker and retries the selected game's history without changing its identity", async () => {
  const other = { ...game, id: 392, name: "Another game" };
  const input = { params: { userId: handle }, query: { query: "game" } };
  const history = {
    game: other,
    rating: 509,
    delta: 6,
    stats: { gamesPlayed: 2, gamesWon: 1, winRate: 50 },
    points: [
      { ordinal: 1, rating: 503, delta: 3 },
      { ordinal: 2, rating: 509, delta: 6 },
    ],
    nextCursor: null,
  };
  services.callServerTool
    .mockResolvedValueOnce(result("list_profile_games", { items: [other], nextCursor: null }))
    .mockRejectedValueOnce(new Error("history temporarily unavailable"))
    .mockResolvedValueOnce(result("get_profile_game_history", history));
  open("list_profile_games", { items: [game], nextCursor: game.id }, input);
  expect(services.callServerTool).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  expect(await screen.findByRole("option", { name: game.name })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  const option = await screen.findByRole("option", { name: other.name });
  expect(screen.getByRole("option", { name: game.name })).toBeVisible();
  fireEvent.click(option);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load rating history");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("img", { name: "OpenSkill rating history" })).toBeVisible();
  expect(services.callServerTool).toHaveBeenNthCalledWith(
    1,
    {
      name: "list_profile_games",
      arguments: { ...input, query: { ...input.query, cursor: game.id } },
    },
    { signal: expect.any(AbortSignal) },
  );
  for (const call of services.callServerTool.mock.calls.slice(1)) {
    expect(call).toEqual([
      {
        name: "get_profile_game_history",
        arguments: { params: { userId: handle, gameId: "392" } },
      },
      { signal: expect.any(AbortSignal) },
    ]);
  }
  fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(screen.queryByRole("img", { name: "OpenSkill rating history" })).toBeNull();
});

it("shows the real empty game picker without inventing a rated game or making another request", async () => {
  open("list_profile_games", { items: [], nextCursor: null }, { params: { userId: handle } });
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  expect(await screen.findByText("No games found")).toBeVisible();
  expect(services.callServerTool).not.toHaveBeenCalled();
});

it("does not open a game picker when the tool result lacks its profile identity", () => {
  open("list_profile_games", { items: [game], nextCursor: null });
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load rating history");
  expect(screen.queryByRole("button", { name: /Board game/ })).toBeNull();
  expect(services.callServerTool).not.toHaveBeenCalled();
});

it("marks all inbox notices from the toolbar and requires confirmation before deleting all", async () => {
  const receipts = { success: true };
  services.callServerTool
    .mockResolvedValueOnce(result("mark_all_notifications_read", receipts))
    .mockResolvedValueOnce(
      result("list_notifications", {
        notifications: [{ ...notification, readAt: date }],
        unreadCount: 0,
        nextCursor: null,
      }),
    )
    .mockResolvedValueOnce(result("delete_all_notifications", receipts))
    .mockResolvedValueOnce(
      result("list_notifications", { notifications: [], unreadCount: 0, nextCursor: null }),
    );
  open("list_notifications", { notifications: [notification], unreadCount: 1, nextCursor: null });
  fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull(),
  );
  const trigger = screen.getByRole("button", { name: "Delete all notifications" });
  fireEvent.click(trigger);
  let dialog = await screen.findByRole("dialog", { name: "Delete all notifications?" });
  expect(dialog).toHaveTextContent("All notifications will be permanently deleted.");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(services.callServerTool).toHaveBeenCalledTimes(2);
  fireEvent.click(trigger);
  dialog = await screen.findByRole("dialog", { name: "Delete all notifications?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete all notifications" }));
  expect(await screen.findByText("No notifications yet")).toBeVisible();
  expect(services.callServerTool).toHaveBeenNthCalledWith(
    1,
    { name: "mark_all_notifications_read", arguments: {} },
    { signal: undefined },
  );
  expect(services.callServerTool).toHaveBeenNthCalledWith(
    3,
    { name: "delete_all_notifications", arguments: {} },
    { signal: undefined },
  );
});

it("leaves a notice unread after the host refuses its link, while retaining its explicit read action", async () => {
  services.openLink.mockResolvedValueOnce({ isError: true });
  services.callServerTool
    .mockResolvedValueOnce(result("mark_notification_read", { success: true }))
    .mockResolvedValueOnce(
      result("list_notifications", {
        notifications: [{ ...notification, readAt: date }],
        unreadCount: 0,
        nextCursor: null,
      }),
    );
  open("list_notifications", { notifications: [notification], unreadCount: 1, nextCursor: null });
  fireEvent.click(screen.getByRole("button", { name: /Game night/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not complete the action. Try again.",
  );
  expect(services.callServerTool).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull());
  expect(services.callServerTool).toHaveBeenNthCalledWith(
    1,
    { name: "mark_notification_read", arguments: { params: { notificationId: first } } },
    { signal: undefined },
  );
});

it("shows a change list's empty state when given a valid snapshot without changes", () => {
  open("list_notification_changes", {
    asOf: date,
    changes: [],
    nextCursor: null,
    tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
  });
  expect(screen.getByText("No new changes")).toBeVisible();
  expect(screen.queryByText("Invitations remain unread until you respond.")).toBeNull();
  expect(services.callServerTool).not.toHaveBeenCalled();
});

it("keeps the existing contact rows during a next-page failure, then retries the same cursor", async () => {
  let failNextPage!: (error: Error) => void;
  const pending = new Promise<never>((_resolve, reject) => {
    failNextPage = reject;
  });
  services.callServerTool
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce(result("search_users", { users: [], nextCursor: handle }));
  open("search_users", { users: [one], nextCursor: handle }, { query: { query: "test" } });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByLabelText("Loading…")).toBeVisible();
  expect(screen.getByText("@avery")).toBeVisible();
  await act(async () => failNextPage(new Error("page unavailable")));
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /Load more|Try again/ })).toBeNull(),
  );
  expect(screen.getByText("@avery")).toBeVisible();
  expect(services.callServerTool).toHaveBeenCalledTimes(2);
  expect(services.callServerTool.mock.calls[0][0]).toEqual(
    services.callServerTool.mock.calls[1][0],
  );
});

it("does not make activity links outside BGO actionable and surfaces host navigation errors", async () => {
  const entry = {
    id: "activity",
    kind: "group_join",
    occurredAt: date,
    context: "Friendly games",
    author: one,
  };
  const firstView = open("list_profile_activity", { items: [], nextCursor: null });
  expect(screen.getByText("No activities yet")).toBeVisible();
  firstView.unmount();
  services.openLink.mockRejectedValueOnce(new Error("host link unavailable"));
  open("list_profile_activity", {
    items: [{ ...entry, href: "//unrelated.example" }],
    nextCursor: null,
  });
  expect(screen.getByText(entry.context)).toBeVisible();
  expect(screen.queryByRole("button", { name: entry.context })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "avery" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
});

it.each([
  ["avery", "@avery"],
  [null, "Unknown"],
])(
  "renders the available identity and known win percentage for a profile without a name",
  (username, expectedIdentity) => {
    open("get_user_profile", {
      ...one,
      name: "",
      username,
      social: { friends: 0, following: 0, followers: 0 },
      player: { gamesPlayed: 20, gamesWon: 8, winRate: 40 },
    });
    expect(screen.getByText(expectedIdentity)).toBeVisible();
    expect(screen.getByText("40%")).toBeVisible();
  },
);

it("keeps granted catalog choices and a retry action after a temporary next-page error", async () => {
  const other = { ...game, id: 392, name: "Another game" };
  services.callServerTool
    .mockRejectedValueOnce(new Error("catalog page unavailable"))
    .mockResolvedValueOnce(result("list_profile_games", { items: [other], nextCursor: null }));
  open(
    "list_profile_games",
    { items: [game], nextCursor: game.id },
    { params: { userId: handle } },
  );
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  expect(await screen.findByRole("option", { name: game.name })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  const retry = await screen.findByRole("button", { name: "Try again" });
  expect(screen.getByRole("option", { name: game.name })).toBeVisible();
  fireEvent.click(retry);
  expect(await screen.findByRole("option", { name: other.name })).toBeVisible();
  expect(services.callServerTool.mock.calls[0][0]).toEqual(
    services.callServerTool.mock.calls[1][0],
  );
});
