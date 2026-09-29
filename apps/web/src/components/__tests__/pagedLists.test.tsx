import { useGroups, useMatches } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const filters = {
  query: "Catan",
  roles: ["admin", "accepted"] as ("admin" | "accepted")[],
  limit: 1,
};
const group = (id: string) => ({
  id,
  name: "Catan friends",
  adminUserId: "me",
  invitations: [],
  createdAt: "2026-09-24T12:00:00.000Z",
});
const match = (id: string) => ({
  id,
  name: "Catan night",
  adminUserId: "me",
  invitations: [],
  createdAt: "2026-09-24T12:00:00.000Z",
});

afterEach(() => vi.unstubAllGlobals());

describe("paginated lists", () => {
  it("loads group pages, avoids unpaged requests, and rolls optimistic archive back", async () => {
    let failDelete = () => {};
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.method === "DELETE")
          return new Promise((resolve) => {
            failDelete = () => resolve(new Response("{}", { status: 500 }));
          });
        const second = String(input).includes("cursor=");
        return new Response(
          JSON.stringify({
            groups: [group(second ? "second" : "first")],
            nextCursor: second ? null : "next",
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(
      () =>
        useGroups({
          apiUrl: "https://api.example.com",
          token: "old-token",
          getToken: vi.fn(async () => "fresh-token"),
          userId: "me",
          listFilters: filters,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "limit=1&roles=admin%2Caccepted&query=Catan",
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://api.example.com/api/groups",
      expect.anything(),
    );
    await act(() => result.current.paging.fetchNextPage());
    await waitFor(() =>
      expect(result.current.list.data?.map((row) => row.id)).toEqual(["first", "second"]),
    );
    act(() => result.current.archive.mutate("first"));
    await waitFor(() => expect(result.current.list.data?.map((row) => row.id)).toEqual(["second"]));
    failDelete();
    await waitFor(() => expect(result.current.archive.isError).toBe(true));
    expect(result.current.list.data?.map((row) => row.id)).toEqual(["first", "second"]);
  });

  it("removes an accepted invitation from invited-only cached pages and restores failed responses", async () => {
    let failResponse = () => {};
    const invitation = { id: "invitation-1", inviteeUserId: "me", status: "PENDING" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.method === "PATCH")
          return new Promise((resolve) => {
            failResponse = () => resolve(new Response("{}", { status: 500 }));
          });
        return new Response(
          JSON.stringify({
            groups: [{ ...group("first"), adminUserId: "other", invitations: [invitation] }],
            nextCursor: null,
          }),
        );
      }),
    );
    const { result } = renderHook(
      () =>
        useGroups({
          apiUrl: "https://api.example.com",
          token: "token",
          userId: "me",
          listFilters: { query: "", roles: ["invited"], limit: 20 },
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    act(() => result.current.respond.mutate({ invitationId: invitation.id, decision: "accept" }));
    await waitFor(() => expect(result.current.list.data).toHaveLength(0));
    failResponse();
    await waitFor(() => expect(result.current.respond.isError).toBe(true));
    expect(result.current.list.data).toHaveLength(1);
  });

  it("loads match pages with fresh auth and inserts optimistic creation once", async () => {
    let failCreate = () => {};
    const getToken = vi.fn(async () => "rotating-token");
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.method === "POST")
          return new Promise((resolve) => {
            failCreate = () => resolve(new Response("{}", { status: 500 }));
          });
        const second = String(input).includes("cursor=");
        return new Response(
          JSON.stringify({
            matches: [match(second ? "second" : "first")],
            nextCursor: second ? null : "next",
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(
      () =>
        useMatches({
          apiUrl: "https://api.example.com",
          token: "old-token",
          getToken,
          userId: "me",
          listFilters: filters,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    await act(() => result.current.paging.fetchNextPage());
    await waitFor(() =>
      expect(result.current.list.data?.map((row) => row.id)).toEqual(["first", "second"]),
    );
    expect(getToken).toHaveBeenCalledTimes(2);
    act(() =>
      result.current.create.mutate({
        name: "Catan weekend",
        dates: ["2026-10-01T00:00:00.000Z"],
        minPlayers: 2,
        maxPlayers: 4,
        gameIds: [1],
        invitedUserIds: [],
      }),
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(3));
    expect(result.current.list.data?.filter((row) => row.optimistic)).toHaveLength(1);
    failCreate();
    await waitFor(() => expect(result.current.create.isError).toBe(true));
    expect(result.current.list.data?.map((row) => row.id)).toEqual(["first", "second"]);
  });
});
