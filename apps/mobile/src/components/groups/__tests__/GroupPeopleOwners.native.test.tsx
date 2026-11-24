import { URL } from "node:url";
import type { GroupMembership, GroupRecordResponse } from "@board-game-organizer/schemas";
import {
  type ContactUser,
  groupRecordDetailQuery,
  groupRecordKeys,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GroupInviteScreen from "@/app/group/invite";
import GroupFriendSearchScreen from "@/app/group/search-user";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { beginOptimisticOperation } from "../../../../../../packages/shared/src/common/optimisticOperation";
import { groupRecord } from "../../../../../web/src/test-fixtures/eventRecords";

const API = "https://group-people-owners-native.test";
const io = vi.hoisted(() => ({
  token: vi.fn(async () => "fixture-owner"),
  back: vi.fn(),
  params: {
    slotId: "draft-friends-slot" as string | undefined,
    exclude: "" as string | undefined,
  },
  titles: [] as string[],
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: io.token,
  }),
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { apiUrl: "https://group-people-owners-native.test" },
    },
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: io.back }),
  useLocalSearchParams: () => ({ ...io.params, groupId: group.id }),
  Stack: {
    Screen: ({ options }: { options: { title: string } }) => {
      io.titles.push(options.title);
      return null;
    },
  },
}));
const options = {
  apiUrl: API,
  userId: "owner",
  getToken: io.token,
  enabled: true,
};
const person = (id = "alice", patch: Partial<ContactUser> = {}): ContactUser => ({
  id,
  name: `Player ${id}`,
  username: id,
  email: `${id}@fixture.test`,
  avatarUrl: null,
  isFriend: true,
  presence: { online: false, lastActiveAt: "2030-06-01T10:00:00.000Z" },
  ...patch,
});
let client: QueryClient;
let group: GroupRecordResponse;
let people: ContactUser[];
let status: number;
let gate: Promise<void> | undefined;
let release: (() => void) | undefined;
let reads: URL[];
let signals: (AbortSignal | null | undefined)[];
let writes: { method: string; path: string; body: unknown }[];
let invited: Set<string>;
let unexpected: string[];
function Fixture({ route = false }: { route?: boolean }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        {route ? <GroupFriendSearchScreen /> : <GroupInviteScreen />}
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function mount(route = false, seed = true) {
  if (seed && !route)
    client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group);
  return render(<Fixture route={route} />);
}
async function choose(name = "Player alice", index = 0) {
  const buttons = await screen.findAllByRole("button", {
    name: `Select user: ${name}`,
  });
  await userEvent.setup().press(buttons[index]);
}
beforeEach(() => {
  useAppStore.getState().clearPending();
  io.token.mockClear();
  io.back.mockClear();
  io.params = { slotId: "draft-friends-slot", exclude: "" };
  io.titles = [];
  group = { ...groupRecord };
  people = [person()];
  status = 200;
  gate = undefined;
  release = undefined;
  reads = [];
  signals = [];
  writes = [];
  invited = new Set();
  unexpected = [];
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const method = init?.method ?? "GET";
      if (
        url.origin !== API ||
        new Headers(init?.headers).get("Authorization") !== "Bearer fixture-owner"
      ) {
        unexpected.push(String(url));
        throw new Error("Unexpected picker owner");
      }
      if (method === "GET") {
        reads.push(url);
        signals.push(init?.signal);
        await gate;
        if (init?.signal?.aborted)
          throw Object.assign(new Error("Aborted"), { name: "AbortError" });
        if (status !== 200)
          return Response.json(
            {
              error: status === 403 ? "GROUP_ACCESS_DENIED" : "GROUP_UNAVAILABLE",
            },
            { status },
          );
        if (url.pathname === `/api/groups/${group.id}`) return Response.json(group);
        if (url.pathname === `/api/groups/${group.id}/invitees`)
          return Response.json({
            items: people.filter((item) => !invited.has(item.id)),
            nextCursor: null,
          });
        if (url.pathname === "/api/relationships")
          return Response.json({
            rows: people.map((profile) => ({
              fromUserId: "owner",
              toUserId: profile.id,
              profile,
            })),
            nextCursor: null,
          });
      }
      if (method === "POST" && url.pathname === `/api/groups/${group.id}/members`) {
        const body = JSON.parse(String(init?.body)) as { userId: string };
        writes.push({ method, path: url.pathname, body });
        invited.add(body.userId);
        const membership: GroupMembership = {
          id: "44444444-4444-4444-8444-444444444444",
          groupId: group.id,
          userId: body.userId,
          kind: "INVITATION",
          status: "PENDING",
          version: 1,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        };
        return Response.json(membership);
      }
      unexpected.push(`${method} ${url}`);
      throw new Error("Unexpected group picker endpoint");
    }),
  );
});
afterEach(async () => {
  await cleanup();
  release?.();
  await client.cancelQueries();
  client.clear();
  useAppStore.getState().clearPending();
  expect(unexpected).toEqual([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Actual GroupPeoplePicker/route, actual PeoplePicker/shared hooks, Query and
// Zustand handoff. Expo Stack/Back/params are SDK configuration boundaries,
// not a simulated navigator or a device navigation performance measurement.
it.each(["admin", "moderator"] as const)(
  "lets an approved %s choose the canonical invitee and submits only a pending invitation",
  async (role) => {
    group = {
      ...group,
      role,
      ...(role === "moderator"
        ? {
            adminUserId: "creator",
            myMembership: {
              id: "55555555-5555-4555-8555-555555555555",
              groupId: group.id,
              userId: "owner",
              kind: "INVITATION",
              status: "ACCEPTED",
              role: "MODERATOR",
              version: 1,
              createdAt: group.createdAt,
              updatedAt: group.updatedAt,
            } as GroupMembership,
          }
        : {}),
    };
    await mount();
    await screen.findByText("Player alice");
    expect(reads[0].pathname).toBe(`/api/groups/${group.id}/invitees`);
    expect(writes).toEqual([]);
    expect(io.back).not.toHaveBeenCalled();
    await choose();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: "POST",
      path: `/api/groups/${group.id}/members`,
      body: { userId: "alice" },
    });
    expect(io.back).toHaveBeenCalledExactlyOnceWith();
    expect(useAppStore.getState().pendingUser).toBeNull();
    expect(io.titles).toContain("Invite friends");
  },
);

it("keeps a non-manager out of the invitation source even when they may view the group", async () => {
  group = {
    ...group,
    adminUserId: "creator",
    role: "accepted",
    canInvite: false,
    canEdit: false,
    myMembership: {
      id: "55555555-5555-4555-8555-555555555555",
      groupId: group.id,
      userId: "owner",
      kind: "INVITATION",
      status: "ACCEPTED",
      role: "MEMBER",
      version: 1,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    },
  };
  await mount();
  expect(screen.getByText("Group admin required")).toBeVisible();
  expect(screen.queryByTestId("people-picker-scroll")).toBeNull();
  expect(reads).toEqual([]);
  expect(writes).toEqual([]);
});

it("explains that an unapproved public group cannot invite without revealing any candidates", async () => {
  group = {
    ...group,
    type: "PUBLIC",
    approved: undefined,
    reviewStatus: "PENDING",
    canInvite: false,
    canViewMembers: false,
    canViewEvents: false,
    canViewRankings: false,
    canSocialInteract: false,
  };
  await mount();
  expect(screen.getByText("Invitations require an approved group.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  expect(reads).toEqual([]);
});

it.each([403, 503])(
  "preserves the actual %s detail error and retries only after an explicit action",
  async (code) => {
    status = code;
    await mount(false, false);
    expect(
      await screen.findByText(code === 403 ? "Group admin required" : "Could not load group"),
    ).toBeVisible();
    expect(screen.queryByTestId("people-picker-scroll")).toBeNull();
    status = 200;
    await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Player alice")).toBeVisible();
    expect(writes).toEqual([]);
  },
);

it("keeps initial group restoration distinct from a denied invitation source", async () => {
  gate = new Promise<void>((finish) => {
    release = finish;
  });
  await mount(false, false);
  await waitFor(() => expect(reads).toHaveLength(1));
  expect(screen.queryByText("Group admin required")).toBeNull();
  expect(screen.queryByText("Could not load group")).toBeNull();
  await act(() => release?.());
  expect(await screen.findByText("Player alice")).toBeVisible();
});

it.each(["write", "person"] as const)(
  "guards native selection against a current real %s journal operation",
  async (lane) => {
    client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group);
    const operation = await beginOptimisticOperation(
      client,
      [
        ...groupRecordKeys.root(options),
        group.id,
        ...(lane === "write" ? ["write"] : ["person", "alice"]),
      ],
      { queryKey: groupRecordKeys.root(options) },
    );
    await mount();
    await screen.findByText("Player alice");
    const button = screen.getAllByRole("button", {
      name: "Select user: Player alice",
    })[0];
    if (lane === "write") expect(button).toBeDisabled();
    else expect(button).toBeEnabled();
    await userEvent.setup().press(button);
    expect(writes).toEqual([]);
    expect(io.back).not.toHaveBeenCalled();
    await act(() => operation.rollback());
  },
);

it.each([undefined, ""])(
  "rejects a missing route handoff destination %s before loading friends",
  async (slotId) => {
    io.params.slotId = slotId;
    await mount(true);
    expect(screen.getByText("Missing selection destination")).toBeVisible();
    expect(reads).toEqual([]);
    expect(io.token).not.toHaveBeenCalled();
    expect(useAppStore.getState().pendingUser).toBeNull();
  },
);

it.each(["alice", null])(
  "writes only the canonical selected-user fields to the current draft slot (username=%s)",
  async (username) => {
    people = [person("alice", { username }), person("excluded"), person("owner")];
    io.params.exclude = "excluded,,owner,";
    await mount(true);
    await screen.findByText("Player alice");
    expect(screen.queryByText("Player excluded")).toBeNull();
    expect(screen.queryByText("Player owner")).toBeNull();
    await choose();
    expect(useAppStore.getState().pendingUser).toEqual({
      slotId: "draft-friends-slot",
      user: {
        id: "alice",
        name: "Player alice",
        username,
        email: "alice@fixture.test",
        avatarUrl: null,
      },
    });
    expect(io.back).toHaveBeenCalledExactlyOnceWith();
    expect(writes).toEqual([]);
    expect(io.titles).toContain("Search friends");
  },
);

it("uses current route destination/exclusions after SDK params change without leaking the previous slot", async () => {
  people = [person("alice"), person("bob")];
  const view = await mount(true);
  await screen.findByText("Player alice");
  io.params = { slotId: "new-draft-slot", exclude: "alice" };
  await view.rerender(<Fixture route />);
  expect(screen.queryByText("Player alice")).toBeNull();
  await choose("Player bob", 1);
  expect(useAppStore.getState().pendingUser?.slotId).toBe("new-draft-slot");
  expect(useAppStore.getState().pendingUser?.user.id).toBe("bob");
  expect(writes).toEqual([]);
});

it("keeps leaving an unselected route passive and cancels its still-pending source read", async () => {
  gate = new Promise<void>((finish) => {
    release = finish;
  });
  const view = await mount(true);
  await waitFor(() => expect(reads).toHaveLength(1));
  await view.unmount();
  expect(signals[0]?.aborted).toBe(true);
  await act(() => release?.());
  expect(useAppStore.getState().pendingUser).toBeNull();
  expect(io.back).not.toHaveBeenCalled();
  expect(writes).toEqual([]);
});

it("opens a valid picker without excluding anyone when the wizard omits optional exclusions", async () => {
  io.params.exclude = undefined;
  await mount(true);
  expect(await screen.findByText("Player alice")).toBeVisible();
  await choose();
  expect(useAppStore.getState().pendingUser?.user.id).toBe("alice");
  expect(io.back).toHaveBeenCalledOnce();
  expect(writes).toEqual([]);
});
