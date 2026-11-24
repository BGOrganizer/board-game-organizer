import type {
  GroupMembership,
  GroupPersonResponse,
  GroupRecordResponse,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { groupRecordDetailQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { createContext, type ReactNode, useContext } from "react";
import { Keyboard, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GroupScreen from "@/app/group/[groupId]";
import GroupBanScreen from "@/app/group/ban";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { groupRecord, plannedEvent } from "../../../../../web/src/test-fixtures/eventRecords";

const API = "https://group-detail-fixtures.test";
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const options = {
  apiUrl: API,
  userId: "owner",
  getToken: async () => "fixture-owner",
  enabled: true,
};
const Api = createContext(options);
const RouteParams = createContext<{ groupId: string; tab?: string } | undefined>(undefined);
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => useContext(Api) }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => {
    const owner = useContext(Api);
    return {
      ...owner,
      sessionId: `session-${owner.userId}`,
      isLoaded: true,
      isSignedIn: true,
    };
  },
}));
// Navigation owns native header placement. Preserve the application's real
// header action elements so their consent and authorization behavior still runs.
vi.mock("expo-router", () => ({
  useRouter: () => navigation,
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => useContext(RouteParams) ?? {},
  Stack: {
    Screen: ({ options: config }: { options: { headerRight?: () => ReactNode } }) => (
      <View>{config.headerRight?.()}</View>
    ),
  },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://group-detail-fixtures.test" } } },
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getPermissionsAsync: vi.fn(async () => ({ status: "denied", canAskAgain: false })),
}));

let client: QueryClient;
let group: GroupRecordResponse;
let groupStatus = 200;
let pendingGroup: Promise<Response> | undefined;
let writes: { method: string; path: string; body: Record<string, unknown> }[];
let reads: string[];
const json = (data: unknown, status = 200) => Response.json(data, { status });
function membership(
  kind: GroupMembership["kind"],
  status: GroupMembership["status"],
): GroupMembership {
  return {
    id: plannedEvent.id,
    groupId: groupRecord.id,
    userId: "owner",
    kind,
    status,
    version: 3,
    createdAt: groupRecord.createdAt,
    updatedAt: groupRecord.updatedAt,
  };
}
const member: GroupPersonResponse = {
  userId: "group-player",
  name: "Group Player",
  username: "group-player",
  avatarUrl: null,
  isAdmin: false,
  ban: null,
  membership: {
    id: plannedEvent.id,
    groupId: groupRecord.id,
    userId: "group-player",
    kind: "REQUEST",
    status: "ACCEPTED",
    version: 1,
    createdAt: groupRecord.createdAt,
    updatedAt: groupRecord.updatedAt,
  },
};
const zeros = { connections: 0, requests: 0, search: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  group = { ...groupRecord, canSocialInteract: false };
  groupStatus = 200;
  pendingGroup = undefined;
  writes = [];
  reads = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected group fixture origin: ${url.origin}`);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-owner");
      const method = init?.method ?? "GET";
      const path = url.pathname;
      if (method === "GET") {
        reads.push(path);
        if (path === `/api/groups/${group.id}`)
          return (
            pendingGroup ??
            json(
              groupStatus === 200 ? group : { error: "Fixture group read unavailable" },
              groupStatus,
            )
          );
        if (path === `/api/groups/${group.id}/members`)
          return json({
            items: url.searchParams.get("mode") === "accepted" ? [member] : [],
            nextCursor: null,
          });
        if (path === `/api/groups/${group.id}/leaderboard`)
          return json({
            games: [{ id: 1, name: "Chess ranking", imageUrl: null }],
            players: [],
            nextCursor: null,
          });
        if (path === "/api/events")
          return json({
            items: [{ ...plannedEvent, groupId: group.id, name: "Group games evening" }],
            nextCursor: null,
          });
        if (path === "/api/relationships") return json({ rows: [], nextCursor: null });
        if (path === "/api/users/suggestions")
          return json({ users: [], hasContacts: false, nextCursor: null });
        if (path === "/api/notifications/changes")
          return json({
            asOf: "2030-06-01T10:00:00.000Z",
            changes: [],
            nextCursor: null,
            tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
          });
        if (path === "/api/notifications/attention") {
          const targets = JSON.parse(
            url.searchParams.get("targets") ?? "[]",
          ) as NotificationAttentionTarget[];
          return json({
            asOf: "2030-06-01T10:00:00.000Z",
            unreadCount: 0,
            summary: { tables: 0, events: 0, groups: 0, contacts: 0, sections: zeros },
            targets: targets.map((target) => ({
              target,
              count: 0,
              direct: 0,
              events: 0,
              sections: zeros,
            })),
          });
        }
      } else {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        writes.push({ method, path, body });
        if (path === `/api/groups/${group.id}` && method === "DELETE")
          return json({ id: group.id, eventIds: [] });
        if (path === `/api/groups/${group.id}/membership` && method === "POST") {
          const next = membership("REQUEST", "PENDING");
          group = { ...group, role: "requested", myMembership: next };
          return json(next);
        }
        if (path === `/api/groups/${group.id}/members/owner` && method === "PATCH") {
          const accepted = body.action === "accept";
          const next = {
            ...membership(
              group.myMembership?.kind ?? "REQUEST",
              accepted ? "ACCEPTED" : body.action === "decline" ? "DECLINED" : "LEFT",
            ),
            version: 4,
          };
          group = {
            ...group,
            role: accepted ? "accepted" : "none",
            myMembership: next,
            canViewMembers: accepted,
            canViewEvents: accepted,
            canViewRankings: accepted,
          };
          return json(next);
        }
      }
      throw new Error(`Unexpected group fixture request: ${method} ${path}`);
    }),
  );
});
afterEach(async () => {
  await act(() => client.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(
  seed = true,
  initialTab?: "info" | "members" | "events",
  bannedMembersRoute = false,
) {
  if (seed) client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group);
  return render(
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <Api value={options}>
          <RouteParams value={{ groupId: group.id, tab: initialTab }}>
            {bannedMembersRoute ? <GroupBanScreen /> : <GroupScreen />}
          </RouteParams>
        </Api>
      </NativeTestProviders>
    </QueryClientProvider>,
  );
}
const select = async (name: string) => {
  await userEvent.setup().press(screen.getByRole("tab", { name }));
  expect(screen.getByRole("tab", { name })).toBeSelected();
};

it.each([
  ["info", "Details", "Group details help", "The group's verified venue and full address."],
  ["members", "Members", "Group members help", "Group managers can invite people."],
  ["events", "Events", "Group events help", "Events in a private group are for its members."],
] as const)(
  "shows the %s group help in its own visible tab",
  async (initialTab, title, label, copy) => {
    group = { ...group, location: plannedEvent.locations[0] };
    await installNativePopoverMeasurements();
    await mount(true, initialTab);
    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Group venue help" })).toBeNull();
    expect(screen.queryByText(copy)).toBeNull();
    await pressMeasuredPopover(screen.getByRole("button", { name: label }));
    expect(screen.getByText(copy)).toBeVisible();
    expect(writes).toEqual([]);
  },
);

it("dismisses the native keyboard only for an actual Group destination change, never reselection", async () => {
  const dismiss = vi.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
  try {
    await mount();
    await select("Details");
    expect(dismiss).not.toHaveBeenCalled();
    await select("Members");
    await screen.findByText("@group-player");
    expect(dismiss).toHaveBeenCalledOnce();
    await select("Members");
    expect(dismiss).toHaveBeenCalledOnce();
    await select("Events");
    await screen.findByText("Group games evening");
    expect(dismiss).toHaveBeenCalledTimes(2);
    expect(writes).toEqual([]);
  } finally {
    dismiss.mockRestore();
  }
});

it("retains real group Members, Events and Rankings panels while independent native headers stay reactive", async () => {
  await mount();
  expect(screen.getByRole("button", { name: "Edit group" })).toBeEnabled();
  await select("Members");
  const person = await screen.findByText("@group-player");
  expect(screen.getByRole("button", { name: "Invite friends" })).toBeEnabled();
  await select("Events");
  const event = await screen.findByText("Group games evening");
  expect(screen.queryByText("@group-player")).not.toBeOnTheScreen();
  await select("Members");
  expect(screen.getByText("@group-player")).toBe(person);
  await select("Events");
  expect(screen.getByText("Group games evening")).toBe(event);
  await select("Rankings");
  expect(await screen.findByTestId("rating-game-select-trigger")).toBeOnTheScreen();
  await select("Details");
  expect(screen.getByRole("button", { name: "Edit group" })).toBeEnabled();
  expect(writes).toEqual([]);
});

it("drops a retained panel immediately when the server revokes access and keeps the detail editable only when authorized", async () => {
  await mount();
  await select("Members");
  await screen.findByText("@group-player");
  const protectedReads = () =>
    reads.filter(
      (path) =>
        path === `/api/groups/${group.id}/members` ||
        path === `/api/groups/${group.id}/leaderboard` ||
        path === "/api/events",
    );
  const beforeRevocation = protectedReads().length;
  group = {
    ...group,
    name: "Updated authoritative group",
    canViewMembers: false,
    canViewEvents: false,
    canViewRankings: false,
    canEdit: false,
    canInvite: false,
    role: "none",
  };
  await act(() => client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group));
  // Query publishes through its observer scheduler. At the first observed
  // authoritative render, selection and protected panels must already agree.
  await screen.findByRole("header", { name: group.name });
  expect(screen.getByRole("tab", { name: "Details" })).toBeSelected();
  expect(screen.getByRole("header", { name: group.name })).toBeOnTheScreen();
  expect(
    screen.queryByText("@group-player", { includeHiddenElements: true }),
  ).not.toBeOnTheScreen();
  expect(screen.queryByRole("tab", { name: "Members" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Edit group" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Delete group" })).not.toBeOnTheScreen();
  expect(protectedReads()).toHaveLength(beforeRevocation);
});

it("uses a permitted initial tab and opens the actual edit destination only on explicit action", async () => {
  await mount(true, "members");
  expect(screen.getByRole("tab", { name: "Members" })).toBeSelected();
  await screen.findByText("@group-player");
  await select("Details");
  await userEvent.setup().press(screen.getByRole("button", { name: "Edit group" }));
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/group/wizard",
    params: { groupId: group.id },
  });
});

it("keeps uncached errors observable and retries only after an explicit request", async () => {
  groupStatus = 503;
  await mount(false);
  expect(await screen.findByText("Could not load group details")).toBeOnTheScreen();
  expect(screen.queryByRole("tab")).not.toBeOnTheScreen();
  groupStatus = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("header", { name: group.name })).toBeOnTheScreen();
  expect(reads.filter((path) => path === `/api/groups/${group.id}`)).toHaveLength(2);
});

it("shows no cached private record after the server denies its background refresh", async () => {
  await mount();
  groupStatus = 403;
  await act(() =>
    client.invalidateQueries({ queryKey: groupRecordDetailQuery(options, group.id).queryKey }),
  );
  expect(await screen.findByText("Could not load group details")).toBeOnTheScreen();
  expect(screen.queryByText(group.name)).not.toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Delete group" })).not.toBeOnTheScreen();
});

it("keeps an uncached pending request distinct from a missing group", async () => {
  let finish: (response: Response) => void = () => {};
  pendingGroup = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await mount(false);
  expect(screen.queryByText("Could not load group details")).not.toBeOnTheScreen();
  expect(screen.queryByRole("tab")).not.toBeOnTheScreen();
  await act(() => finish(json(group)));
  expect(await screen.findByRole("header", { name: group.name })).toBeOnTheScreen();
});

it("requires separate explicit confirmation before deleting a group and its events", async () => {
  await mount();
  await userEvent.setup().press(screen.getByRole("button", { name: "Delete group" }));
  expect(writes).toEqual([]);
  await userEvent.setup().press(screen.getByRole("button", { name: "Cancel" }));
  expect(writes).toEqual([]);
  await userEvent.setup().press(screen.getByRole("button", { name: "Delete group" }));
  await userEvent.setup().press(screen.getByRole("button", { name: "Delete group and events" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    method: "DELETE",
    path: `/api/groups/${group.id}`,
    body: { version: 1, deleteEvents: true },
  });
  expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/(tabs)/groups");
});

it.each(["accept", "decline"] as const)(
  "records invitation %s only after the actual consent action",
  async (action) => {
    group = {
      ...group,
      role: "invited",
      myMembership: membership("INVITATION", "PENDING"),
      canEdit: false,
      canInvite: false,
      canViewMembers: false,
      canViewEvents: false,
      canViewRankings: false,
    };
    await mount();
    expect(writes).toEqual([]);
    await userEvent
      .setup()
      .press(screen.getByRole("button", { name: action === "accept" ? "Accept" : "Decline" }));
    if (action === "decline") {
      expect(writes).toEqual([]);
      await userEvent.setup().press(screen.getByRole("button", { name: "Confirm" }));
    }
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: "PATCH",
      path: `/api/groups/${group.id}/members/owner`,
      body: { action, version: 3 },
    });
    if (action === "accept")
      expect(await screen.findByRole("tab", { name: "Members" })).toBeOnTheScreen();
  },
);

it("requests public-group membership without granting accepted access and cancels it explicitly", async () => {
  group = {
    ...group,
    type: "PUBLIC",
    role: "none",
    canEdit: false,
    canInvite: false,
    canViewMembers: false,
    canViewEvents: false,
    canViewRankings: false,
  };
  await mount();
  await userEvent.setup().press(screen.getByRole("button", { name: "Request membership" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    method: "POST",
    path: `/api/groups/${group.id}/membership`,
    body: {},
  });
  expect(await screen.findByRole("button", { name: "Cancel request" })).toBeOnTheScreen();
  expect(screen.queryByRole("tab", { name: "Events" })).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Cancel request" }));
  expect(writes).toHaveLength(1);
  await userEvent.setup().press(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].body).toEqual({ action: "cancel", version: 3 });
});

it("opens the members owner from a valid group exclusion route", async () => {
  await mount(true, undefined, true);
  expect(await screen.findByRole("tab", { name: "Members" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Group members help" })).toBeEnabled();
});

it("shows requests only for the current manager and withdraws the affordance on demotion", async () => {
  group = { ...group, pendingRequestCount: 2 };
  await mount();
  const requestsBadge = () =>
    within(screen.getByRole("tab", { name: /Members/ })).queryByLabelText("Requests to review");
  expect(requestsBadge()).toBeVisible();
  group = {
    ...group,
    role: "accepted",
    myMembership: membership("REQUEST", "ACCEPTED"),
    canEdit: false,
    canInvite: false,
  };
  await act(() => client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group));
  await waitFor(() => expect(requestsBadge()).toBeNull());
});

it("preserves accepted access until an explicit versioned leave is confirmed", async () => {
  group = {
    ...group,
    role: "accepted",
    myMembership: membership("REQUEST", "ACCEPTED"),
    canEdit: false,
    canInvite: false,
  };
  await mount();
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Leave group" }));
  expect(
    screen.getByText(
      "Active table registrations are removed. Historical results remain unchanged.",
    ),
  ).toBeVisible();
  expect(writes).toEqual([]);
  await user.press(screen.getByRole("button", { name: "Cancel" }));
  expect(writes).toEqual([]);
  await user.press(screen.getByRole("button", { name: "Leave group" }));
  await user.press(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    method: "PATCH",
    path: `/api/groups/${group.id}/members/owner`,
    body: { action: "cancel", version: 3 },
  });
  expect(screen.queryByRole("button", { name: "Leave group" })).toBeNull();
});

it.each(["delete", "decline"] as const)(
  "blocks stale %s confirmation after an authoritative group authority change",
  async (action) => {
    group = {
      ...group,
      type: "PUBLIC",
      ...(action === "decline"
        ? {
            role: "invited" as const,
            myMembership: membership("INVITATION", "PENDING"),
            canEdit: false,
            canInvite: false,
          }
        : {}),
    };
    await mount();
    const user = userEvent.setup();
    await user.press(
      screen.getByRole("button", { name: action === "delete" ? "Delete group" : "Decline" }),
    );
    const confirmation = action === "delete" ? "Delete group and events" : "Confirm";
    expect(screen.getByRole("button", { name: confirmation })).toBeEnabled();

    group = {
      ...group,
      version: group.version + 1,
      role: "none",
      myMembership: null,
      canEdit: false,
      canInvite: false,
      canViewMembers: false,
      canViewEvents: false,
      canViewRankings: false,
    };
    await act(() => client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group));
    const stale = screen.queryByRole("button", { name: confirmation });
    if (stale) await user.press(stale);
    expect(writes).toEqual([]);
    expect(navigation.replace).not.toHaveBeenCalled();
    if (action === "decline") {
      const cancel = screen.queryByRole("button", { name: "Cancel" });
      if (cancel) await user.press(cancel);
    }
    await waitFor(() => expect(screen.queryByRole("button", { name: confirmation })).toBeNull());
  },
);
