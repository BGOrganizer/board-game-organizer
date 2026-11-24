import type {
  GroupBan,
  GroupPersonResponse,
  GroupRecordResponse,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { clearSessionQueryCache, groupRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { enterDateTime } from "@/test-fixtures/dateTime";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupMembers } from "../GroupMembers";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  feedback: { onSuccess: vi.fn(), onOptimisticUpdate: vi.fn(), onError: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test.invalid",
    userId: "owner",
    getToken: async () => "fresh-group-token",
    feedback: mocks.feedback,
  }),
}));
const owner = {
  apiUrl: "https://api.test.invalid",
  userId: "owner",
  getToken: async () => "fresh-group-token",
};
const at = "2026-11-14T00:00:00.000Z";
const member: GroupPersonResponse = {
  userId: "user_member",
  name: "Accepted Player",
  username: "accepted-player",
  avatarUrl: null,
  isAdmin: false,
  ban: null,
  membership: {
    id: groupRecord.id,
    groupId: groupRecord.id,
    userId: "user_member",
    kind: "INVITATION",
    status: "ACCEPTED",
    role: "MEMBER",
    version: 3,
    createdAt: at,
    updatedAt: at,
  },
};
const clients: QueryClient[] = [];
function mount(group: GroupRecordResponse = groupRecord) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const build = (value: GroupRecordResponse) => (
    <QueryClientProvider client={client}>
      <GroupMembers group={value} />
    </QueryClientProvider>
  );
  const view = renderWithI18n(build(group));
  return { ...view, client, rerender: (value: GroupRecordResponse) => view.rerender(build(value)) };
}
function boundary(input: string, group = groupRecord) {
  const url = new URL(input);
  if (url.pathname === "/api/notifications/attention") {
    const targets = JSON.parse(
      url.searchParams.get("targets") ?? "[]",
    ) as NotificationAttentionTarget[];
    const sections = { connections: 0, requests: 0, search: 0 };
    return Response.json({
      asOf: at,
      unreadCount: 0,
      summary: { tables: 0, events: 0, groups: 0, contacts: 0, sections },
      targets: targets.map((target) => ({ target, count: 0, direct: 0, events: 0, sections })),
    });
  }
  if (url.pathname === `/api/groups/${group.id}`) return Response.json(group);
  if (url.pathname === "/api/relationships") return Response.json({ rows: [], nextCursor: null });
  if (url.pathname === "/api/users/suggestions")
    return Response.json({ users: [], hasContacts: false, nextCursor: null });
  return undefined;
}
function members(
  input: string,
  accepted: GroupPersonResponse[] = [],
  bans: GroupPersonResponse[] = [],
) {
  const mode = new URL(input).searchParams.get("mode");
  return Response.json({
    items: mode === "accepted" ? accepted : mode === "bans" ? bans : [],
    nextCursor: null,
  });
}
afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const client of clients.splice(0)) clearSessionQueryCache(client);
  });
  vi.unstubAllGlobals();
});

it("opens the real invite route and explains an authoritative capability loss without leaving an enabled action", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => boundary(input) ?? members(input)),
  );
  const view = mount();
  fireEvent.click(screen.getByRole("button", { name: "Invite friends" }));
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/groups/${groupRecord.id}/invite`);
  view.rerender({
    ...groupRecord,
    type: "PUBLIC",
    approved: undefined,
    canInvite: false,
    canViewMembers: false,
  });
  expect(
    (screen.getByRole("button", { name: "Invite friends" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Invitations unavailable" }));
  expect(await screen.findByText("Invitations require an approved group.")).toBeTruthy();
});

it.each([null, "2030-06-05T18:00:00.000Z"])(
  "revokes an exclusion only after explicit consent and never restores membership, until=%s",
  async (until) => {
    const ban: GroupBan = {
      id: "44444444-4444-4444-8444-444444444444",
      groupId: groupRecord.id,
      userId: "user_excluded",
      adminUserId: "owner",
      until,
      createdAt: at,
      updatedAt: at,
    };
    const excluded: GroupPersonResponse = {
      userId: ban.userId,
      name: "Excluded Player",
      username: "excluded-player",
      avatarUrl: null,
      isAdmin: false,
      membership: null,
      ban,
    };
    let revoked = false;
    const writes: { input: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          writes.push({ input, init });
          revoked = true;
          return Response.json({ ...ban, revokedAt: at });
        }
        return boundary(input) ?? members(input, [], revoked ? [] : [excluded]);
      }),
    );
    mount();
    const label = "Revoke group exclusion: @excluded-player";
    fireEvent.click(await screen.findByRole("button", { name: label }));
    let dialog = await screen.findByRole("dialog", { name: label });
    expect(
      within(dialog).getByText(
        "Revoking an exclusion does not restore membership or registrations. A new invitation or request is required.",
      ),
    ).toBeTruthy();
    expect(writes).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: label }));
    dialog = await screen.findByRole("dialog", { name: label });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke group exclusion" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(new URL(writes[0].input).pathname).toBe(
      `/api/groups/${groupRecord.id}/bans/${ban.userId}`,
    );
    expect(writes[0].init.body).toBeUndefined();
    expect(new Headers(writes[0].init.headers).get("Authorization")).toBe(
      "Bearer fresh-group-token",
    );
    await screen.findByText("No members found");
    expect(screen.queryByText("@excluded-player")).toBeNull();
  },
);

it("hides cached member details and closes the active confirmation when the roster is denied remotely", async () => {
  let denied = false;
  const writes = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") {
        writes();
        return Response.json({ success: true });
      }
      if (new URL(input).pathname.endsWith("/members") && denied)
        return Response.json({ error: "FORBIDDEN" }, { status: 403 });
      return boundary(input) ?? members(input, [member]);
    }),
  );
  const { client } = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Manage member: accepted-player" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove member" }),
  );
  await screen.findByRole("dialog", { name: "Remove member: @accepted-player" });
  denied = true;
  await act(async () => {
    await client.invalidateQueries({
      queryKey: groupRecordKeys.people(owner, groupRecord.id, "accepted", ""),
    });
  });
  expect(await screen.findByText("Could not load group members")).toBeTruthy();
  expect(screen.queryByText("@accepted-player")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Invite friends" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(writes).not.toHaveBeenCalled();
});

it("preserves accepted members through a failed next page and retries the same cursor explicitly", async () => {
  const browser = installBrowserIntersections();
  let release: (response: Response) => void = () => {
    throw new Error("Expected pending Group members request");
  };
  const cursors: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const external = boundary(input);
      if (external) return external;
      const url = new URL(input);
      if (url.searchParams.get("mode") !== "accepted") return members(input);
      const cursor = url.searchParams.get("cursor");
      if (!cursor) return Response.json({ items: [member], nextCursor: "member-page-2" });
      cursors.push(cursor);
      return cursors.length === 1
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Response.json({
            items: [
              {
                ...member,
                userId: "user_second",
                username: "second-player",
                membership: null,
                isAdmin: true,
              },
            ],
            nextCursor: null,
          });
    }),
  );
  mount();
  await screen.findByText("@accepted-player");
  act(() => browser.intersect());
  await waitFor(() => expect(cursors).toHaveLength(1));
  expect(screen.getByText("@accepted-player")).toBeVisible();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
  act(() => browser.intersect());
  expect(cursors).toEqual(["member-page-2"]);
  await act(() => release(Response.json({ error: "UNAVAILABLE" }, { status: 503 })));
  const retry = await screen.findByRole("button", { name: "Could not load more members. Retry" });
  expect(screen.getByText("@accepted-player")).toBeTruthy();
  expect(screen.queryByText("No members found")).toBeNull();
  fireEvent.click(retry);
  expect(await screen.findByText("@second-player")).toBeTruthy();
  expect(screen.getByText("@accepted-player")).toBeTruthy();
  expect(cursors).toEqual(["member-page-2", "member-page-2"]);
});

it("validates temporary exclusion locally and rolls a rejected exclusion back to the accepted roster", async () => {
  const writes: RequestInit[] = [];
  const group = { ...groupRecord, location: plannedEvent.locations[0] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push(init);
        return Response.json({ error: "BAN_FROZEN_PARTICIPATION" }, { status: 400 });
      }
      return boundary(input, group) ?? members(input, [member]);
    }),
  );
  mount(group);
  fireEvent.click(await screen.findByRole("button", { name: "Manage member: accepted-player" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Ban from group" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Ban from group: @accepted-player" });
  fireEvent.click(within(dialog).getByRole("switch", { name: "Temporary exclusion" }));
  const deadline = within(dialog).getByRole("group", { name: "Excluded until" });
  enterDateTime(deadline, "2000-01-01T00:00");
  fireEvent.click(within(dialog).getByRole("button", { name: "Ban from group" }));
  expect(within(dialog).getByRole("alert").textContent).toBe(
    "Choose a valid future date and time.",
  );
  expect(writes).toHaveLength(0);
  enterDateTime(deadline, "2030-06-05T20:00");
  fireEvent.click(within(dialog).getByRole("button", { name: "Ban from group" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(JSON.parse(String(writes[0].body))).toEqual({
    userId: member.userId,
    until: "2030-06-05T18:00:00.000Z",
  });
  await waitFor(() =>
    expect(mocks.feedback.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "BAN_FROZEN_PARTICIPATION" }),
      "ban_group_member",
    ),
  );
  expect(screen.getByText("@accepted-player")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Manage member: accepted-player" })).toBeTruthy();
});

it("reports a failed global block from the actual social menu while preserving Group membership", async () => {
  const social = { isFriend: false, isFollowing: false, isFollower: false, blockedByMe: false };
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (new URL(input).pathname === "/api/relationships" && init?.method === "POST") {
        writes++;
        return Response.json({ error: "REJECTED" }, { status: 400 });
      }
      return boundary(input) ?? members(input, [{ ...member, social }]);
    }),
  );
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Block user globally" }));
  const dialog = await screen.findByRole("dialog", { name: "Block contact" });
  expect(writes).toBe(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Block user globally" }));
  await waitFor(() =>
    expect(mocks.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "block"),
  );
  expect(writes).toBe(1);
  expect(screen.getByText("@accepted-player")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Manage member: accepted-player" })).toBeTruthy();
});

it("uses the roster fallback for an unavailable identity without making a member action available", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (input: string) =>
        boundary(input) ??
        members(input, [
          {
            ...member,
            name: null,
            username: null,
            userId: "deleted-account",
            membership: {
              id: groupRecord.id,
              groupId: groupRecord.id,
              userId: "deleted-account",
              kind: "INVITATION",
              status: "ACCEPTED",
              role: "MEMBER",
              version: 1,
              createdAt: at,
              updatedAt: at,
            },
          },
        ]),
    ),
  );
  mount({ ...groupRecord, role: "accepted", canInvite: false, canSocialInteract: false });
  expect(await screen.findByText("Username unavailable")).toBeVisible();
  expect(screen.queryByText("deleted-account")).toBeNull();
  expect(screen.queryByRole("button", { name: /Manage member/ })).toBeNull();
});
