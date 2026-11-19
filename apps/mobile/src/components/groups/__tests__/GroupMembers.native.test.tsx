import { URL } from "node:url";
import type {
  GroupBan,
  GroupMembership,
  GroupPersonResponse,
  GroupRecordResponse,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { groupPeopleQuery, groupRecordDetailQuery } from "@board-game-organizer/shared";
import type { AndroidNativeProps } from "@react-native-community/datetimepicker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { groupRecord } from "../../../../../web/src/test-fixtures/eventRecords";
import { GroupMembers } from "../GroupMembers";

const API = "https://group-members-native.test";
const io = vi.hoisted(() => ({
  token: vi.fn(async () => "fixture-owner"),
  push: vi.fn(),
  date: vi.fn<(props: AndroidNativeProps) => void>(),
  dismissDate: vi.fn(),
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
    expoConfig: { extra: { apiUrl: "https://group-members-native.test" } },
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: io.push }),
  useLocalSearchParams: () => ({}),
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: { open: io.date, dismiss: io.dismissDate },
}));
const now = "2030-06-01T10:00:00.000Z";
function member(userId: string, patch: Partial<GroupMembership> = {}): GroupMembership {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    groupId: groupRecord.id,
    userId,
    kind: "INVITATION",
    status: "ACCEPTED",
    role: "MEMBER",
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}
function person(userId: string, patch: Partial<GroupPersonResponse> = {}): GroupPersonResponse {
  return {
    userId,
    name: `Player ${userId}`,
    username: userId,
    avatarUrl: null,
    isAdmin: false,
    membership: member(userId),
    ban: null,
    social: {
      isFollowing: false,
      isFollower: false,
      isFriend: false,
      blockedByMe: false,
    },
    ...patch,
  };
}
function ban(userId: string, patch: Partial<GroupBan> = {}): GroupBan {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    groupId: groupRecord.id,
    userId,
    adminUserId: "owner",
    until: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}
let client: QueryClient;
let group: GroupRecordResponse;
let people: GroupPersonResponse[];
let code: number;
let writeCode: number;
let pendingRead: Promise<void> | undefined;
let pendingWrite: Promise<void> | undefined;
let releases: (() => void)[];
let reads: URL[];
let writes: { method: string; path: string; body: Record<string, unknown> }[];
let unexpected: string[];
const options = {
  apiUrl: API,
  userId: "owner",
  enabled: true,
  getToken: io.token,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  releases.push(resolve);
  return { promise, resolve };
}
async function http(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const method = init?.method ?? "GET";
  if (
    url.origin !== API ||
    new Headers(init?.headers).get("Authorization") !== "Bearer fixture-owner"
  ) {
    unexpected.push(String(url));
    throw new Error("Unexpected group member HTTP owner");
  }
  if (method === "GET") {
    reads.push(url);
    if (url.pathname === `/api/groups/${group.id}`) return Response.json(group);
    if (url.pathname === `/api/groups/${group.id}/members`) {
      await pendingRead;
      if (code !== 200) return Response.json({ error: "GROUP_ACCESS_DENIED" }, { status: code });
      const mode = url.searchParams.get("mode");
      const rows = people.filter((row) =>
        mode === "bans"
          ? Boolean(row.ban && !row.ban.revokedAt)
          : !row.ban &&
            (mode === "pending"
              ? row.membership?.status === "PENDING"
              : row.isAdmin || row.membership?.status === "ACCEPTED"),
      );
      return Response.json({ items: rows, nextCursor: null });
    }
    if (url.pathname === "/api/notifications/attention") {
      const targets = JSON.parse(
        url.searchParams.get("targets") ?? "[]",
      ) as NotificationAttentionTarget[];
      const zeros = { connections: 0, requests: 0, search: 0 };
      return Response.json({
        asOf: now,
        unreadCount: 0,
        summary: {
          tables: 0,
          events: 0,
          groups: 0,
          contacts: 0,
          sections: zeros,
        },
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
    writes.push({ method, path: url.pathname, body });
    await pendingWrite;
    if (writeCode !== 200)
      return Response.json({ error: "MEMBERSHIP_CHANGED" }, { status: writeCode });
    const match = new RegExp(`^/api/groups/${group.id}/members/([^/]+)$`).exec(url.pathname);
    if (method === "PATCH" && match) {
      const target = people.find((row) => row.userId === match[1]);
      if (!target?.membership)
        throw new Error("Membership receipt requires an actual source membership");
      const action = body.action;
      const next: GroupMembership = {
        ...target.membership,
        status: action === "reject" ? "DECLINED" : action === "remove" ? "LEFT" : "ACCEPTED",
        role:
          action === "promote"
            ? "MODERATOR"
            : action === "demote"
              ? "MEMBER"
              : target.membership.role,
        version: target.membership.version + 1,
      };
      target.membership = next;
      return Response.json(next);
    }
    if (method === "POST" && url.pathname === `/api/groups/${group.id}/bans`) {
      const target = people.find((row) => row.userId === body.userId);
      if (!target) throw new Error("Missing ban target");
      const next = ban(target.userId, {
        until: typeof body.until === "string" ? body.until : null,
      });
      target.ban = next;
      if (target.membership)
        target.membership = {
          ...target.membership,
          status: "LEFT",
          role: "MEMBER",
          version: target.membership.version + 1,
        };
      return Response.json(next);
    }
    if (method === "DELETE" && url.pathname.startsWith(`/api/groups/${group.id}/bans/`)) {
      const target = people.find((row) => row.userId === url.pathname.split("/").at(-1));
      if (!target?.ban) throw new Error("Missing exclusion receipt");
      target.ban = { ...target.ban, revokedAt: new Date().toISOString() };
      return Response.json(target.ban);
    }
    if (
      method === "POST" &&
      url.pathname === "/api/relationships" &&
      url.searchParams.get("type") === "follow"
    ) {
      const target = people.find((row) => row.userId === body.targetUserId);
      if (target?.social) target.social = { ...target.social, isFollowing: true };
      return Response.json({ success: true });
    }
  }
  unexpected.push(`${method} ${url}`);
  throw new Error("Unexpected group member request");
}
function Fixture() {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <GroupMembers group={group} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function mount() {
  client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group);
  return render(<Fixture />);
}
beforeEach(async () => {
  await installNativePopoverMeasurements();
  io.push.mockClear();
  io.token.mockClear();
  io.date.mockClear();
  io.dismissDate.mockClear();
  group = { ...groupRecord, memberCount: 3 };
  people = [person("owner", { isAdmin: true, membership: null }), person("guest"), person("other")];
  code = writeCode = 200;
  reads = [];
  writes = [];
  unexpected = [];
  releases = [];
  pendingRead = pendingWrite = undefined;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(groupRecordDetailQuery(options, group.id).queryKey, group);
  vi.stubGlobal("fetch", vi.fn(http));
});
afterEach(async () => {
  await cleanup();
  for (const release of releases) release();
  await client.cancelQueries();
  client.clear();
  expect(unexpected).toEqual([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function ready() {
  await screen.findByText("@guest");
  await waitFor(() =>
    expect(
      reads
        .filter((url) => url.pathname.endsWith("/members"))
        .map((url) => url.searchParams.get("mode")),
    ).toEqual(["accepted", "pending", "bans"]),
  );
}
async function confirm(label: string) {
  const dialog = screen.getByTestId("confirmation-dialog");
  expect(dialog).toBeVisible();
  await userEvent.setup().press(within(dialog).getByRole("button", { name: label }));
}
async function openManagement(action: string, user = "guest") {
  await userEvent.setup().press(screen.getByRole("button", { name: `Manage member: ${user}` }));
  // Real MemberActions/Gorhom content stays in the tree. Its native worklet
  // visibility is outside Node; this is a rendered callback/state contract.
  const title = screen.getByText(`Manage member: ${user}`, {
    includeHiddenElements: true,
  });
  let parent = title.parent;
  while (
    parent &&
    !within(parent).queryAllByRole("button", {
      name: action,
      includeHiddenElements: true,
    }).length
  )
    parent = parent.parent;
  if (!parent) throw new Error("Expected actual member action sheet content");
  await fireEvent.press(
    within(parent).getByRole("button", {
      name: action,
      includeHiddenElements: true,
    }),
  );
}

// Actual GroupMembers, headless workflow, Query, real UserList/HeroUI and
// native form dialogs. Only Clerk/date SDK, router and HTTP/native measurement
// boundaries are controlled; sheet callbacks do not claim physical visibility.
it("reads the accepted, pending and exclusion streams in order and exposes only authorized member actions", async () => {
  await mount();
  await ready();
  expect(screen.getByRole("button", { name: "Manage member: guest" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Manage member: owner" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Actions: @owner" })).toBeNull();
  expect(writes).toEqual([]);
});

it("routes the real Invite friends header only after an explicit press", async () => {
  await mount();
  await ready();
  await userEvent.setup().press(screen.getByRole("button", { name: "Invite friends" }));
  expect(io.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/group/invite",
    params: { groupId: group.id },
  });
  expect(writes).toEqual([]);
});

it("keeps unapproved public-group invitations disabled with an independently readable explanation", async () => {
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
  expect(screen.getByRole("button", { name: "Invite friends" })).toBeDisabled();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Invitations unavailable" }));
  expect(screen.getByText("Invitations require an approved group.")).toBeVisible();
  expect(reads.filter((url) => url.pathname.endsWith("/members"))).toEqual([]);
});

it("preserves pending roster loading separately from an empty or failed source", async () => {
  const gate = deferred();
  pendingRead = gate.promise;
  await mount();
  await waitFor(() => expect(reads.some((url) => url.pathname.endsWith("/members"))).toBe(true));
  expect(screen.queryByText("No members found")).toBeNull();
  expect(screen.queryByText("Could not load group members")).toBeNull();
  await act(() => gate.resolve());
  await ready();
});

it("keeps a failed roster observable and retries the authorized stream", async () => {
  code = 503;
  await mount();
  expect(await screen.findByText("Could not load group members")).toBeVisible();
  expect(screen.queryByText("No members found")).toBeNull();
  code = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("@guest");
});

it.each(["approve", "reject"] as const)(
  "records pending-request %s only after explicit separate consent",
  async (action) => {
    people[1] = person("guest", {
      membership: member("guest", { kind: "REQUEST", status: "PENDING" }),
    });
    await mount();
    await ready();
    await userEvent.setup().press(
      screen.getByRole("button", {
        name: "Respond to membership request: @guest",
      }),
    );
    expect(writes).toEqual([]);
    await confirm("Cancel");
    expect(writes).toEqual([]);
    await userEvent.setup().press(
      screen.getByRole("button", {
        name: "Respond to membership request: @guest",
      }),
    );
    await confirm(action === "approve" ? "Approve" : "Reject");
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: "PATCH",
      path: `/api/groups/${group.id}/members/guest`,
      body: { action, version: 1 },
    });
    if (action === "reject") await waitFor(() => expect(screen.queryByText("@guest")).toBeNull());
  },
);

it.each(["promote", "demote"] as const)(
  "changes moderator authority through the actual %s dialog and authoritative receipt",
  async (action) => {
    if (action === "demote")
      people[1] = person("guest", {
        membership: member("guest", { role: "MODERATOR" }),
      });
    await mount();
    await ready();
    const label = action === "promote" ? "Make moderator" : "Demote to member";
    await openManagement(label);
    expect(writes).toEqual([]);
    await confirm(label);
    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() =>
      expect(
        client
          .getQueryData(groupPeopleQuery(options, group.id, "accepted").queryKey)
          ?.pages[0].items.find((row) => row.userId === "guest")?.membership?.role,
      ).toBe(action === "promote" ? "MODERATOR" : "MEMBER"),
    );
    expect(writes[0].body).toEqual({ action, version: 1 });
  },
);

it("removes an accepted member only after confirmation and preserves the other members", async () => {
  await mount();
  await ready();
  await openManagement("Remove member");
  await confirm("Cancel");
  expect(writes).toEqual([]);
  await openManagement("Remove member");
  await confirm("Remove member");
  await waitFor(() => expect(screen.queryByText("@guest")).toBeNull());
  expect(screen.getByText("@other")).toBeVisible();
  expect(writes[0].body).toEqual({ action: "remove", version: 1 });
});

it("applies a permanent group exclusion through its own consent dialog without global blocking", async () => {
  await mount();
  await ready();
  await openManagement("Ban from group");
  expect(screen.getByRole("switch", { name: "Temporary exclusion" })).not.toBeChecked();
  expect(writes).toEqual([]);
  await confirm("Ban from group");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    method: "POST",
    path: `/api/groups/${group.id}/bans`,
    body: { userId: "guest", until: null },
  });
  expect(await screen.findByText("Permanent exclusion")).toBeVisible();
});

it.each([null, "2035-06-01T10:00:00.000Z"])(
  "revokes the displayed %s exclusion without restoring membership",
  async (until) => {
    people[1] = person("guest", {
      membership: member("guest", { status: "LEFT" }),
      ban: ban("guest", { until }),
    });
    await mount();
    await ready();
    if (until) expect(screen.getByText(/^Exclusion ends:/)).toBeVisible();
    else expect(screen.getByText("Permanent exclusion")).toBeVisible();
    await userEvent
      .setup()
      .press(screen.getByRole("button", { name: "Revoke group exclusion: @guest" }));
    expect(writes).toEqual([]);
    await confirm("Revoke group exclusion");
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: "DELETE",
      path: `/api/groups/${group.id}/bans/guest`,
      body: {},
    });
    await waitFor(() => expect(screen.queryByText("@guest")).toBeNull());
    expect(people[1].membership?.status).toBe("LEFT");
  },
);

it("keeps a target busy during an authoritative role write while another member remains actionable", async () => {
  const gate = deferred();
  pendingWrite = gate.promise;
  await mount();
  await ready();
  await openManagement("Make moderator");
  await confirm("Make moderator");
  await waitFor(() => expect(writes).toHaveLength(1));
  const target = screen.getByRole("button", { name: "Manage member: guest" });
  expect(target).toBeDisabled();
  expect(screen.getByRole("button", { name: "Manage member: other" })).toBeEnabled();
  await userEvent.setup().press(target);
  expect(writes).toHaveLength(1);
  await act(() => gate.resolve());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Manage member: guest" })).toBeEnabled(),
  );
});

it("does not grant a stale open management dialog authority after its moderator is demoted", async () => {
  group = {
    ...group,
    adminUserId: "creator",
    role: "moderator",
    myMembership: member("owner", { role: "MODERATOR" }),
  };
  people[0] = person("creator", { isAdmin: true, membership: null });
  people.push(person("owner", { membership: member("owner", { role: "MODERATOR" }) }));
  const view = await mount();
  await ready();
  await openManagement("Remove member");
  group = {
    ...group,
    role: "accepted",
    myMembership: member("owner"),
    canInvite: false,
    canEdit: false,
  };
  await view.rerender(<Fixture />);
  await confirm("Remove member");
  expect(writes).toEqual([]);
  expect(screen.getByText("@guest")).toBeVisible();
});

it("hides all retained private people and management consent after a denied roster refresh", async () => {
  await mount();
  await ready();
  await openManagement("Remove member");
  code = 403;
  await act(() =>
    client.invalidateQueries({
      queryKey: groupPeopleQuery(options, group.id, "accepted").queryKey,
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not load group members")).toBeVisible();
  expect(screen.queryByText("@guest", { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(writes).toEqual([]);
});

it("does not expose peer-moderator or creator management to another moderator", async () => {
  group = {
    ...group,
    adminUserId: "creator",
    role: "moderator",
    myMembership: member("owner", { role: "MODERATOR" }),
  };
  people = [
    person("creator", { isAdmin: true, membership: null }),
    person("owner", { membership: member("owner", { role: "MODERATOR" }) }),
    person("guest", { membership: member("guest", { role: "MODERATOR" }) }),
    person("other"),
  ];
  await mount();
  await ready();
  expect(screen.queryByRole("button", { name: "Manage member: guest" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Manage member: creator" })).toBeNull();
  expect(screen.getByRole("button", { name: "Manage member: other" })).toBeEnabled();
});

it("opens the real social actions and dispatches follow through the shared contacts mutation", async () => {
  await mount();
  await ready();
  await userEvent.setup().press(screen.getByRole("button", { name: "Actions: @guest" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Follow", includeHiddenElements: true }),
  );
  await waitFor(() =>
    expect(writes.some((write) => write.path === "/api/relationships")).toBe(true),
  );
  expect(writes.find((write) => write.path === "/api/relationships")?.body).toEqual({
    targetUserId: "guest",
  });
});

it("hides an open social sheet when its public-group moderator loses accepted membership", async () => {
  group = {
    ...group,
    type: "PUBLIC",
    adminUserId: "creator",
    role: "moderator",
    myMembership: member("owner", { role: "MODERATOR" }),
  };
  people[0] = person("creator", { isAdmin: true, membership: null });
  people.push(person("owner", { membership: member("owner", { role: "MODERATOR" }) }));
  const view = await mount();
  await ready();
  await userEvent.setup().press(screen.getByRole("button", { name: "Actions: @guest" }));
  group = {
    ...group,
    role: "none",
    myMembership: member("owner", { status: "LEFT" }),
    canViewMembers: true,
    canViewEvents: false,
    canViewRankings: false,
    canSocialInteract: false,
    canInvite: false,
    canEdit: false,
  };
  await view.rerender(<Fixture />);
  expect(screen.queryByRole("button", { name: "Actions: @guest" })).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: "Follow",
      includeHiddenElements: true,
    }),
  ).toBeNull();
  expect(writes).toEqual([]);
});

it("rolls back a rejected role change, exposes real feedback and permits a fresh explicit retry", async () => {
  writeCode = 400;
  await mount();
  await ready();
  await openManagement("Make moderator");
  await confirm("Make moderator");
  const titles = await screen.findAllByText("Could not appoint group moderator");
  const visible = titles.find((title) => {
    for (let node = title.parent; node; node = node.parent) {
      if (node.props.pointerEvents === "none" && typeof node.props.onLayout === "function")
        return false;
    }
    return true;
  });
  // Exclude only the SDK's separate hidden measurement copy; retain the real
  // feedback instance's visibility assertion without changing its styles.
  expect(visible).toBeDefined();
  expect(visible).toBeVisible();
  const current = () =>
    client
      .getQueryData(groupPeopleQuery(options, group.id, "accepted").queryKey)
      ?.pages[0].items.find((row) => row.userId === "guest")?.membership;
  await waitFor(() => expect(current()).toMatchObject({ role: "MEMBER", version: 1 }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Manage member: guest" })).toBeEnabled(),
  );
  expect(writes).toHaveLength(1);
  writeCode = 200;
  await openManagement("Make moderator");
  await confirm("Make moderator");
  await waitFor(() => expect(current()).toMatchObject({ role: "MODERATOR", version: 2 }));
  expect(writes).toHaveLength(2);
  expect(writes[1].body).toEqual({ action: "promote", version: 1 });
});
