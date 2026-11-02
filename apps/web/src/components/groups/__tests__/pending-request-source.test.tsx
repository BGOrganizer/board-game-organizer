import type { GroupMembership } from "@board-game-organizer/schemas";
import { groupRecordKeys, useGroupRecordActions } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";

const options = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
afterEach(() => vi.unstubAllGlobals());
it.each([true, false])(
  "reconciles complete pending request counts from the authoritative Group read after review, without another actor/group losing work (%s)",
  async (success) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const source = { ...groupRecord, pendingRequestCount: 2 };
    const ownList = groupRecordKeys.list(options, "mine");
    const foreignList = groupRecordKeys.list({ ...options, userId: "another-actor" }, "mine");
    const unrelated = {
      ...source,
      id: "99999999-9999-4999-8999-999999999999",
      pendingRequestCount: 8,
    };
    client.setQueryData(groupRecordKeys.detail(options, source.id), source);
    client.setQueryData(ownList, {
      pages: [{ items: [source, unrelated], nextCursor: null }],
      pageParams: [""],
    });
    client.setQueryData(foreignList, {
      pages: [{ items: [{ ...source, pendingRequestCount: 6 }], nextCursor: null }],
      pageParams: [""],
    });
    const membership: GroupMembership = {
      id: unrelated.id,
      groupId: source.id,
      userId: "requester",
      kind: "REQUEST",
      status: "PENDING",
      version: 1,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
    client.setQueryData(groupRecordKeys.people(options, source.id, "pending", ""), {
      pages: [
        {
          items: [
            {
              userId: membership.userId,
              membership,
              isAdmin: false,
              ban: null,
              name: "Requester",
              username: null,
              avatarUrl: null,
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [""],
    });
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? success
          ? Response.json({ ...membership, status: "DECLINED", version: 2 })
          : Response.json({ error: "Denied" }, { status: 409 })
        : Response.json({ ...source, pendingRequestCount: 1 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const hook = renderHook(() => useGroupRecordActions(options, source.id), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    try {
      await act(async () => {
        const mutation = hook.result.current.membership.mutateAsync({
          id: source.id,
          userId: membership.userId,
          input: { action: "reject", version: 1 },
        });
        if (success) await mutation;
        else await expect(mutation).rejects.toBeDefined();
      });
      const data = client.getQueryData<{ pages: Array<{ items: (typeof source)[] }> }>(ownList);
      expect(data?.pages[0].items.find((row) => row.id === source.id)?.pendingRequestCount).toBe(
        success ? 1 : 2,
      );
      expect(data?.pages[0].items.find((row) => row.id === unrelated.id)?.pendingRequestCount).toBe(
        8,
      );
      expect(
        client.getQueryData<{ pages: Array<{ items: (typeof source)[] }> }>(foreignList)?.pages[0]
          .items[0].pendingRequestCount,
      ).toBe(6);
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
      if (success)
        expect(
          fetcher.mock.calls.some(
            ([url, init]) => url.endsWith(`/groups/${source.id}`) && init?.method === "GET",
          ),
        ).toBe(true);
    } finally {
      hook.unmount();
      client.clear();
    }
  },
);
