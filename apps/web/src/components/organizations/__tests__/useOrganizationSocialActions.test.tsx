import type {
  CommunityPageResponse,
  OrganizationMemberResponse,
} from "@board-game-organizer/schemas";
import {
  type ContactAction,
  organizationKeys,
  organizationMemberContact,
  patchOrganizationMemberData,
  restoreRemovedOrganizationMember,
  useOrganizationSocialActions,
} from "@board-game-organizer/shared";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    ].map((key) => [key, { mutateAsync: vi.fn() }]),
  ),
);
vi.mock("../../../../../../packages/shared/src/contacts/hooks/useContacts", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useContacts: () => calls,
}));
const options = { apiUrl: "https://api.test", userId: "viewer", getToken: async () => "fresh" };
const person: OrganizationMemberResponse = {
  userId: "person",
  name: "Full Name",
  username: "nickname",
  avatarUrl: null,
  isAdmin: false,
  membership: null,
  social: {
    isFollowing: false,
    isFollower: false,
    isFriend: false,
    blockedByMe: false,
  },
};
const key = organizationKeys.members(options, "org", "accepted", "");
const data = (
  rows: OrganizationMemberResponse[],
): InfiniteData<CommunityPageResponse<OrganizationMemberResponse>> => ({
  pages: [{ items: rows, nextCursor: null }],
  pageParams: [""],
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(
    key,
    data([
      person,
      { ...person, userId: "other" },
      { ...person, userId: "legacy", social: undefined },
    ]),
  );
  const hook = renderHook(() => useOrganizationSocialActions(options), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  const current = () => {
    const row =
      client.getQueryData<InfiniteData<CommunityPageResponse<OrganizationMemberResponse>>>(key)
        ?.pages[0].items[0];
    if (!row) throw new Error("Expected cached organization member");
    return row;
  };
  return { client, hook, current };
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const call of Object.values(calls)) call.mutateAsync.mockResolvedValue({ success: true });
});

describe("organization social actions", () => {
  it("builds private social profiles from full names, nicknames, then stable identity", () => {
    expect(organizationMemberContact(person)).toMatchObject({
      id: "person",
      name: "Full Name",
      email: null,
      isFriend: false,
    });
    expect(organizationMemberContact({ ...person, name: null }).name).toBe("nickname");
    expect(
      organizationMemberContact({ ...person, name: null, username: null, social: undefined }).name,
    ).toBe("person");
  });
  it.each([
    ["follow", "follow", { isFollowing: true }],
    ["unfollow", "unfollow", { isFollowing: false }],
    ["unfriend", "unfriend", { isFriend: false }],
    ["friend_request", "friendRequest", { friendRequest: "outgoing" }],
    ["cancel_friend_request", "cancelFriendRequest", { friendRequest: undefined }],
    ["reject_friend_request", "rejectFriendRequest", { friendRequest: undefined }],
    [
      "accept_friend_request",
      "acceptFriendRequest",
      { isFriend: true, isFollowing: true, isFollower: true },
    ],
    ["block", "block", { blockedByMe: true, isFriend: false }],
    ["unblock", "unblock", { blockedByMe: false }],
  ] as const)(
    "optimistically applies %s to owned member caches, not organization membership",
    async (action, mutation, expected) => {
      const { client, hook, current } = setup();
      const foreign = organizationKeys.members(
        { ...options, userId: "foreign" },
        "org",
        "accepted",
        "",
      );
      client.setQueryData(foreign, data([person]));
      const otherOrganization = organizationKeys.members(options, "org-2", "accepted", "");
      client.setQueryData(otherOrganization, data([person]));
      let finish!: () => void;
      calls[mutation].mutateAsync.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      let pending!: Promise<void>;
      await act(async () => {
        pending = hook.result.current.run(person, action as ContactAction);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(hook.result.current.busy).toBe(true);
      expect(current()?.social).toMatchObject(expected);
      expect(current()?.membership).toBeNull();
      expect(client.getQueryData(otherOrganization)).toEqual(data([current()]));
      expect(client.getQueryData(foreign)).toEqual(data([person]));
      await act(async () => {
        finish();
        await pending;
      });
      expect(hook.result.current.busy).toBe(false);
      expect(calls[mutation].mutateAsync).toHaveBeenCalledWith({
        targetUserId: "person",
        targetUser: expect.objectContaining({ name: "Full Name", email: null }),
      });
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    },
  );
  it("selectively rolls back social fields without restoring removed members or unrelated changes", async () => {
    const { client, hook, current } = setup();
    const noTarget = organizationKeys.members(options, "org-3", "accepted", "");
    client.setQueryData(noTarget, data([{ ...person, userId: "absent" }]));
    const missing = organizationKeys.members(options, "org-4", "accepted", "");
    client.getQueryCache().build(client, { queryKey: missing });
    let reject!: (error: Error) => void;
    calls.block.mutateAsync.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = hook.result.current.run(person, "block");
      await Promise.resolve();
      await Promise.resolve();
    });
    client.setQueryData(
      key,
      data([
        { ...current(), name: "Updated name" },
        { ...person, userId: "other", name: "Unrelated update" },
      ]),
    );
    await act(async () => {
      reject(new Error("409"));
      await expect(pending).rejects.toThrow("409");
    });
    expect(current()).toMatchObject({ name: "Updated name", social: person.social });
    expect(
      client.getQueryData<InfiniteData<CommunityPageResponse<OrganizationMemberResponse>>>(key)
        ?.pages[0].items[1].name,
    ).toBe("Unrelated update");
    expect(client.getQueryData(noTarget)).toEqual(data([{ ...person, userId: "absent" }]));
    expect(hook.result.current.busy).toBe(false);
  });
  it("rejects repeated submission, respects serialized contacts mutations and resets after cancellation failure", async () => {
    const { client, hook } = setup();
    let finish!: () => void;
    calls.follow.mutateAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = hook.result.current.run(person, "follow");
      await hook.result.current.run(person, "follow");
    });
    expect(calls.follow.mutateAsync).toHaveBeenCalledOnce();
    await act(async () => {
      finish();
      await pending;
    });
    vi.spyOn(client, "isMutating").mockReturnValueOnce(1);
    await act(() => hook.result.current.run(person, "block"));
    expect(calls.block.mutateAsync).not.toHaveBeenCalled();
    vi.spyOn(client, "cancelQueries").mockRejectedValueOnce(new Error("cancel failed"));
    await act(async () => {
      await expect(hook.result.current.run(person, "block")).rejects.toThrow("cancel failed");
    });
    expect(hook.result.current.busy).toBe(false);
    const mutation = client
      .getMutationCache()
      .build(client, { mutationFn: async () => undefined, scope: { id: "contacts" } });
    await act(() => mutation.execute(undefined));
    const unscoped = client.getMutationCache().build(client, { mutationFn: async () => undefined });
    await act(() => unscoped.execute(undefined));
  });
  it("restores only the removed row, retaining later pages, social changes and cleared private caches", () => {
    const other = { ...person, userId: "other" };
    const changed = {
      ...other,
      name: "Concurrent name",
      social: { isFollowing: true, isFollower: false, isFriend: false, blockedByMe: false },
    };
    const previous = data([person, other]);
    const current = {
      ...data([changed]),
      pages: [
        ...data([changed]).pages,
        { items: [{ ...person, userId: "later" }], nextCursor: null },
      ],
    };
    expect(
      restoreRemovedOrganizationMember(current, previous, "person")?.pages.map(
        (page) => page.items,
      ),
    ).toEqual([[person, changed], [{ ...person, userId: "later" }]]);
    expect(restoreRemovedOrganizationMember(undefined, previous, "person")).toBeUndefined();
    expect(restoreRemovedOrganizationMember(current, undefined, "person")).toBe(current);
    expect(restoreRemovedOrganizationMember(previous, previous, "person")).toBe(previous);
    expect(restoreRemovedOrganizationMember(current, previous, "absent")).toEqual(current);
    expect(restoreRemovedOrganizationMember(data([]), data([other, person]), "person")).toEqual(
      data([person]),
    );
  });

  it("patches only known member pages and removes only selected rows", () => {
    for (const malformed of [null, false, {}, { pages: false }])
      expect(patchOrganizationMemberData(malformed, () => null)).toBe(malformed);
    expect(
      patchOrganizationMemberData(data([person, { ...person, userId: "other" }]), (row) =>
        row.userId === "person" ? null : row,
      ),
    ).toEqual(data([{ ...person, userId: "other" }]));
  });
});
