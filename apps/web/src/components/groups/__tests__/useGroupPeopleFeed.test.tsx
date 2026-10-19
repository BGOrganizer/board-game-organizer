import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { groupRecordKeys, useGroupPeopleFeed } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const group: GroupRecordResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  adminUserId: "owner",
  type: "PRIVATE",
  approved: { name: "Game Club" },
  reservedNames: [],
  version: 1,
  name: "Game Club",
  logo: null,
  role: "admin",
  myMembership: null,
  createdAt: "2027-01-01T00:00:00Z",
  updatedAt: "2027-01-01T00:00:00Z",
  memberCount: 1,
  eventCount: 0,
  canViewMembers: true,
  canViewEvents: true,
  canViewRankings: true,
  canSocialInteract: true,
  canInvite: true,
  canEdit: true,
};
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    options = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, options, wrapper };
}
afterEach(() => vi.unstubAllGlobals());
it("never exposes cached rosters after access revocation, or cached pending/bans to invitees", async () => {
  const { client, options, wrapper } = setup(),
    fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const mode of ["accepted", "pending", "bans"] as const)
    client.setQueryData(groupRecordKeys.people(options, group.id, mode, ""), {
      pages: [
        {
          items: [
            {
              userId: mode,
              membership: { status: mode === "accepted" ? "ACCEPTED" : "PENDING" },
              ban: mode === "bans" ? { id: "ban" } : null,
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [""],
    });
  const hook = renderHook(({ value }) => useGroupPeopleFeed(options, value), {
    wrapper,
    initialProps: { value: group },
  });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(3));
  hook.rerender({ value: { ...group, role: "invited" } });
  expect(hook.result.current.items.map((row) => row.userId)).toEqual(["accepted"]);
  hook.rerender({ value: { ...group, canViewMembers: false } });
  expect(hook.result.current.items).toEqual([]);
  expect(hook.result.current.isPending).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it("finishes each source before loading pending invitations and exclusions, with observable failures and retry", async () => {
  const { options, wrapper } = setup();
  let fail = true;
  const fetch = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams,
      mode = params.get("mode");
    return mode === "pending" && fail
      ? new Response('{"error":"FAILED"}', { status: 503 })
      : new Response(
          JSON.stringify({
            items: [
              {
                userId: `${mode}${params.get("cursor") ?? ""}`,
                membership: { status: mode === "accepted" ? "ACCEPTED" : "PENDING" },
                ban: mode === "bans" ? { id: "ban" } : null,
              },
            ],
            nextCursor: mode === "accepted" && !params.has("cursor") ? "next" : null,
          }),
        );
  });
  vi.stubGlobal("fetch", fetch);
  const hook = renderHook(() => useGroupPeopleFeed(options, group), { wrapper });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
  expect(fetch.mock.calls).toHaveLength(1);
  await act(async () => {
    await hook.result.current.fetchNextPage();
  });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.items).toHaveLength(2);
  fail = false;
  await act(async () => {
    await hook.result.current.refetch();
  });
  await waitFor(() => expect(hook.result.current.items).toHaveLength(4));
  expect(hook.result.current.hasNextPage).toBe(false);
});
