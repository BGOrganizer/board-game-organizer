import type { GroupPersonResponse } from "@board-game-organizer/schemas";
import {
  groupPersonContact,
  groupRecordKeys,
  useGroupSocialActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const calls = vi.hoisted(() =>
  Object.fromEntries(
    [
      "follow",
      "unfollow",
      "unfriend",
      "friendRequest",
      "cancelFriendRequest",
      "acceptFriendRequest",
      "rejectFriendRequest",
      "block",
      "unblock",
    ].map((name) => [name, { mutateAsync: vi.fn() }]),
  ),
);
vi.mock("../../../../../../packages/shared/src/contacts/hooks/useContacts", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useContacts: () => calls,
}));
const options = { apiUrl: "https://api.test", userId: "viewer", getToken: async () => "fresh" };
const person: GroupPersonResponse = {
  userId: "member",
  name: "Member",
  username: "member",
  avatarUrl: null,
  isAdmin: false,
  membership: null,
  ban: null,
  social: { isFollowing: false, isFollower: false, isFriend: false, blockedByMe: false },
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const key = groupRecordKeys.people(options, "group", "accepted", "");
  client.setQueryData(key, { pages: [{ items: [person], nextCursor: null }], pageParams: [""] });
  const hook = renderHook(() => useGroupSocialActions(options), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, key, hook };
}
it("uses name/username/id fallbacks without exposing fabricated presence", () => {
  expect(groupPersonContact({ ...person, name: undefined, username: "handle" }).name).toBe(
    "handle",
  );
  expect(
    groupPersonContact({ ...person, name: undefined, username: undefined, social: undefined }).name,
  ).toBe("member");
});
it("preserves request direction optimistically and delegates each social transition to Contacts", async () => {
  for (const [action, method] of [
    ["friend_request", "friendRequest"],
    ["cancel_friend_request", "cancelFriendRequest"],
    ["accept_friend_request", "acceptFriendRequest"],
    ["reject_friend_request", "rejectFriendRequest"],
    ["unfriend", "unfriend"],
  ] as const) {
    const { client, key, hook } = setup();
    const row = {
      ...person,
      social: {
        ...person.social!,
        isFollowing: true,
        isFollower: true,
        isFriend: true,
        blockedByMe: true,
        friendRequest: "incoming" as const,
      },
    };
    client.setQueryData(key, {
      pages: [
        { items: [row, { ...person, userId: "unaffected", social: undefined }], nextCursor: null },
      ],
      pageParams: [""],
    });
    await act(() => hook.result.current.run(row, action));
    expect(calls[method].mutateAsync).toHaveBeenCalled();
    const data = client.getQueryData<{ pages: Array<{ items: GroupPersonResponse[] }> }>(key);
    expect(data?.pages[0].items[0].social?.friendRequest).toBe(
      action === "friend_request" ? "outgoing" : action === "unfriend" ? "incoming" : undefined,
    );
    hook.unmount();
    client.clear();
  }
});
it("does not race an active Contacts mutation and releases the local latch after invalidation failure", async () => {
  const { client, hook } = setup();
  let release!: () => void;
  const mutation = client.getMutationCache().build(client, {
    scope: { id: "contacts" },
    mutationFn: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  });
  let active!: Promise<unknown>;
  await act(async () => {
    active = mutation.execute(undefined);
    await Promise.resolve();
  });
  await act(() => hook.result.current.run(person, "follow"));
  expect(calls.follow.mutateAsync).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await active;
  });
  vi.spyOn(client, "invalidateQueries").mockRejectedValueOnce(new Error("cache failure"));
  await act(async () => {
    await expect(hook.result.current.run(person, "follow")).rejects.toThrow("cache failure");
  });
  expect(hook.result.current.busy).toBe(false);
  await act(() => hook.result.current.run(person, "follow"));
  expect(calls.follow.mutateAsync).toHaveBeenCalledTimes(2);
});
beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(calls))
    action.mutateAsync.mockResolvedValue({ success: true });
});
it("never exposes a group social action for a pending viewer or self, without changing Contacts permissions", async () => {
  const { hook } = setup();
  expect(
    groupPersonContact({ ...person, avatarUrl: "https://images.test/avatar.png" }).avatarUrl,
  ).toBe("https://images.test/avatar.png");
  await act(() => hook.result.current.run({ ...person, social: undefined }, "follow"));
  await act(() => hook.result.current.run({ ...person, userId: options.userId }, "follow"));
  expect(calls.follow.mutateAsync).not.toHaveBeenCalled();
  await act(() => hook.result.current.run(person, "follow"));
  expect(calls.follow.mutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({ targetUserId: person.userId }),
  );
});
it("patches only this API/user's group social fields, preserving membership and concurrent changes on rollback", async () => {
  const { client, key, hook } = setup();
  const foreign = groupRecordKeys.people({ ...options, userId: "other" }, "group", "accepted", "");
  const original = client.getQueryData(key);
  client.setQueryData(foreign, original);
  let reject!: (error: Error) => void;
  calls.block.mutateAsync.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = hook.result.current.run(person, "block").catch((error) => error);
    await Promise.resolve();
    await Promise.resolve();
  });
  type Data = {
    pages: Array<{ items: GroupPersonResponse[]; nextCursor: null }>;
    pageParams: string[];
  };
  const patched = client.getQueryData<Data>(key)!;
  expect(patched.pages[0].items[0].social?.blockedByMe).toBe(true);
  client.setQueryData(key, {
    ...patched,
    pages: [
      {
        ...patched.pages[0],
        items: [
          {
            ...patched.pages[0].items[0],
            name: "New profile",
            social: { ...person.social!, blockedByMe: true, isFollower: true },
          },
          { ...person, userId: "new-member", name: "Arrived during mutation" },
        ],
      },
    ],
  });
  await act(async () => {
    reject(new Error("Network unavailable"));
    await pending;
  });
  expect(client.getQueryData<Data>(key)?.pages[0].items[0]).toMatchObject({
    name: "New profile",
    membership: null,
    social: { blockedByMe: false, isFollower: true },
  });
  expect(client.getQueryData<Data>(key)?.pages[0].items[1]).toMatchObject({
    userId: "new-member",
    name: "Arrived during mutation",
  });
  expect(client.getQueryData(foreign)).toEqual(original);
  expect(hook.result.current.busy).toBe(false);
});
