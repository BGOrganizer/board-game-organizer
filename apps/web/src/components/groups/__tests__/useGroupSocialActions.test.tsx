import type { GroupPersonResponse } from "@board-game-organizer/schemas";
import {
  groupPersonContact,
  groupRecordKeys,
  useGroupSocialActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { updateOptimisticBase } from "../../../../../../packages/shared/src/common/optimisticOperation";

const options = {
  apiUrl: "https://api.test",
  userId: "viewer",
  getToken: async () => "fresh",
  feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
};
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
const page = (items: GroupPersonResponse[]) => ({
  pages: [{ items, nextCursor: null }],
  pageParams: [""],
});
function setup(people = [person]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const key = groupRecordKeys.people(options, "group", "accepted", "");
  client.setQueryData(key, page(people));
  for (const name of ["following", "followers", "friends", "pending", "sent", "blocked"])
    client.setQueryData(["contacts", name, options.apiUrl, options.userId], {
      pages: [{ rows: [], nextCursor: null }],
      pageParams: [""],
    });
  const hook = renderHook(() => useGroupSocialActions(options), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  const data = () => client.getQueryData<ReturnType<typeof page>>(key)!;
  return { client, key, hook, data };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("uses name/username/id fallbacks without exposing fabricated presence", () => {
  expect(groupPersonContact({ ...person, name: undefined, username: "handle" }).name).toBe(
    "handle",
  );
  expect(
    groupPersonContact({ ...person, name: undefined, username: undefined, social: undefined }).name,
  ).toBe("member");
  expect(
    groupPersonContact({ ...person, avatarUrl: "https://images.test/avatar.png" }).avatarUrl,
  ).toBe("https://images.test/avatar.png");
});
it("delegates real social writes and keeps request direction coherent across Contacts and Groups", async () => {
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ success: true })),
  );
  vi.stubGlobal("fetch", fetch);
  for (const action of [
    "follow",
    "unfollow",
    "friend_request",
    "cancel_friend_request",
    "accept_friend_request",
    "reject_friend_request",
    "unfriend",
    "block",
    "unblock",
  ] as const) {
    const row = { ...person, social: { ...person.social!, friendRequest: "incoming" as const } };
    const { hook, data } = setup([row]);
    await act(() => hook.result.current.run(row, action));
    expect(data().pages[0].items[0].social?.friendRequest).toBe(
      action === "friend_request"
        ? "outgoing"
        : ["follow", "unfollow", "unfriend", "unblock"].includes(action)
          ? "incoming"
          : undefined,
    );
    expect(data().pages[0].items[0].membership).toBeNull();
    expect(hook.result.current.busy).toBe(false);
    hook.unmount();
  }
  expect(fetch).toHaveBeenCalledTimes(9);
  expect(
    fetch.mock.calls.every(
      (call) =>
        (call[1] as RequestInit).headers &&
        ((call[1] as RequestInit).headers as Record<string, string>).Authorization ===
          "Bearer fresh",
    ),
  ).toBe(true);
});
it("blocks a second write for the same target but keeps a different target interactive", async () => {
  const other = { ...person, userId: "other", name: "Other" };
  const { hook, data, client } = setup([person, other]);
  const requests: Array<{ body: string; resolve: (value: Response) => void }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          requests.push({ body: String(init.body), resolve });
        }),
    ),
  );
  let a!: Promise<void>, b!: Promise<void>;
  await act(async () => {
    a = hook.result.current.run(person, "follow").catch(() => {});
  });
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(hook.result.current.isBusy(person.userId)).toBe(true);
  expect(hook.result.current.isBusy(other.userId)).toBe(false);
  await act(() => hook.result.current.run(person, "block"));
  expect(requests).toHaveLength(1);
  await act(async () => {
    b = hook.result.current.run(other, "follow");
  });
  await waitFor(() => expect(requests).toHaveLength(2));
  await act(async () => {
    requests[1].resolve(new Response(JSON.stringify({ success: true })));
    await b;
  });
  await act(async () => {
    requests[0].resolve(new Response(JSON.stringify({ error: "REJECTED" }), { status: 409 }));
    await a;
  });
  expect(data().pages[0].items.map((row) => row.social?.isFollowing)).toEqual([false, true]);
  const contacts = client.getQueryData<{ pages: Array<{ rows: Array<{ toUserId: string }> }> }>([
    "contacts",
    "following",
    options.apiUrl,
    options.userId,
  ]);
  expect(contacts?.pages[0].rows.map((row) => row.toUserId)).toEqual(["other"]);
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "follow");
});
it("never exposes a Group social action for a missing social grant or for self", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { hook } = setup();
  await act(() => hook.result.current.run({ ...person, social: undefined }, "follow"));
  await act(() => hook.result.current.run({ ...person, userId: options.userId }, "follow"));
  expect(fetch).not.toHaveBeenCalled();
});
it("rolls back the complete social operation while preserving acknowledged profile changes and foreign caches", async () => {
  const { client, key, hook, data } = setup();
  const foreign = groupRecordKeys.people(
    { ...options, userId: "foreign" },
    "group",
    "accepted",
    "",
  );
  const original = data();
  client.setQueryData(foreign, original);
  let reject!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          reject = resolve;
        }),
    ),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.result.current.run(person, "block").catch(() => {});
  });
  await waitFor(() => expect(data().pages[0].items[0].social?.blockedByMe).toBe(true));
  act(() =>
    updateOptimisticBase(client, key, () =>
      page([
        { ...person, name: "New profile", social: { ...person.social!, isFollower: true } },
        { ...person, userId: "new-member", name: "Arrived during mutation" },
      ]),
    ),
  );
  await act(async () => {
    reject(new Response(JSON.stringify({ error: "REJECTED" }), { status: 409 }));
    await pending;
  });
  expect(data().pages[0].items[0]).toMatchObject({
    name: "New profile",
    membership: null,
    social: { blockedByMe: false, isFollower: true },
  });
  expect(data().pages[0].items[1].name).toBe("Arrived during mutation");
  expect(client.getQueryData(foreign)).toEqual(original);
  expect(hook.result.current.busy).toBe(false);
});
