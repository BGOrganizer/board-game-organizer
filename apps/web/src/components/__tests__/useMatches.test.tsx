import { useMatchDetail, useMatches } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

function wrapper(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const invitation = {
  id: "11111111-1111-4111-8111-111111111111",
  matchId: "22222222-2222-4222-8222-222222222222",
  inviterUserId: "user_admin",
  inviteeUserId: "user_guest",
  status: "PENDING",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const detail = {
  match: {
    id: invitation.matchId,
    adminUserId: "user_admin",
    name: "Friday night games",
    dates: ["2026-09-12T18:00:00.000Z"],
    minPlayers: 2,
    maxPlayers: 4,
    invitedUserIds: ["user_guest"],
    gameIds: [1],
    status: "PLANNING",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    invitations: [invitation],
  },
  administrator: {
    id: "user_admin",
    name: "Admin Player",
    email: "admin@example.com",
    avatarUrl: null,
  },
  invitedPlayers: [
    {
      id: "user_guest",
      name: "Guest",
      email: "guest@example.com",
      avatarUrl: null,
      invitation,
    },
  ],
  games: [{ id: 1, name: "Azul", yearPublished: 2017, thumbnail: null }],
};

describe("useMatchDetail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("optimistically saves a choice with a fresh token and rolls back on failure", async () => {
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    const getToken = vi.fn().mockResolvedValue("fresh-token");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let failPatch = () => {};
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Promise<Response>((resolve) => {
            failPatch = () => resolve(new Response("error", { status: 409 }));
          })
        : Promise.resolve(new Response(JSON.stringify(detail), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(
      () =>
        useMatchDetail({
          apiUrl: "https://api.example.com",
          token: "initial-token",
          getToken,
          feedback,
          matchId: invitation.matchId,
        }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.detail.data).toBeTruthy());
    act(() =>
      result.current.setChoice.mutate({
        kind: "dates",
        itemId: detail.match.dates[0],
        choice: "YES",
      }),
    );
    await waitFor(() =>
      expect(
        result.current.detail.data?.choices?.dates?.[String(Date.parse(detail.match.dates[0]))],
      ).toBe("YES"),
    );
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("set_match_choice");
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/matches/${invitation.matchId}/choices`,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
      }),
    );
    failPatch();
    await waitFor(() => expect(result.current.setChoice.isError).toBe(true));
    expect(result.current.detail.data?.choices?.dates).toBeUndefined();
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "set_match_choice");
  });

  it("loads accessible details and responds to invitations with a fresh token", async () => {
    const getToken = vi.fn().mockResolvedValue("fresh-token");
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const listKey = ["matches", "https://api.example.com", "initial-token"];
    client.setQueryData(listKey, [detail.match]);
    let resolvePatch = () => {};
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          resolvePatch = () =>
            resolve(
              new Response(JSON.stringify({ invitation: { ...invitation, status: "ACCEPTED" } }), {
                status: 200,
              }),
            );
        });
      }
      return Promise.resolve(new Response(JSON.stringify(detail), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        useMatchDetail({
          apiUrl: "https://api.example.com",
          token: "initial-token",
          getToken,
          feedback,
          matchId: invitation.matchId,
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.detail.data?.match.name).toBe("Friday night games"));
    act(() => {
      result.current.respondInvitation.mutate({
        invitationId: invitation.id,
        decision: "accept",
      });
    });
    await waitFor(() =>
      expect(result.current.detail.data?.match.invitations[0]?.status).toBe("ACCEPTED"),
    );
    expect(result.current.detail.data?.invitedPlayers[0]?.invitation.status).toBe("ACCEPTED");

    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("accept_match_invitation");
    expect(feedback.onError).not.toHaveBeenCalled();
    expect(getToken).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/match-invitations/${invitation.id}`,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
        body: JSON.stringify({ decision: "accept" }),
      }),
    );
    resolvePatch();
    await waitFor(() => expect(result.current.respondInvitation.isSuccess).toBe(true));
    expect(result.current.detail.data?.match.invitations[0]?.status).toBe("ACCEPTED");
    expect(
      client.getQueryData<Array<typeof detail.match>>(listKey)?.[0]?.invitations[0]?.status,
    ).toBe("ACCEPTED");
  });

  it("removes a declined invitation from the match list immediately", async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            init?.method === "PATCH"
              ? { invitation: { ...invitation, status: "DECLINED" } }
              : { matches: [detail.match] },
          ),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        useMatches({
          apiUrl: "https://api.example.com",
          token: "initial-token",
          getToken: vi.fn().mockResolvedValue("fresh-token"),
          userId: "user_guest",
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    act(() => {
      result.current.respondInvitation.mutate({
        invitationId: invitation.id,
        decision: "decline",
      });
    });

    await waitFor(() => expect(result.current.list.data).toEqual([]));
    await waitFor(() => expect(result.current.respondInvitation.isSuccess).toBe(true));
    expect(result.current.list.data).toEqual([]);
  });

  it("optimistically deletes a match from every list cache", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const listKey = ["matches", "https://api.example.com", "initial-token"];
    client.setQueryData(listKey, [detail.match]);
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "DELETE"
          ? new Response(null, { status: 200 })
          : new Response(JSON.stringify(detail), { status: 200 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        useMatchDetail({
          apiUrl: "https://api.example.com",
          token: "initial-token",
          getToken: vi.fn().mockResolvedValue("fresh-token"),
          feedback,
          matchId: invitation.matchId,
        }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    act(() => result.current.deleteMatch.mutate(invitation.matchId));

    await waitFor(() => expect(client.getQueryData(listKey)).toEqual([]));
    await waitFor(() => expect(result.current.deleteMatch.isSuccess).toBe(true));
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("delete_match");
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/matches/${invitation.matchId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("rolls a failed match departure back into list caches", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const listKey = ["matches", "https://api.example.com", "initial-token"];
    client.setQueryData(listKey, [detail.match]);
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "DELETE"
            ? new Response(null, { status: 500 })
            : new Response(JSON.stringify(detail), { status: 200 }),
        ),
      ),
    );

    const { result } = renderHook(
      () =>
        useMatchDetail({
          apiUrl: "https://api.example.com",
          token: "initial-token",
          getToken: vi.fn().mockResolvedValue("fresh-token"),
          feedback,
          matchId: invitation.matchId,
        }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    act(() => result.current.leaveMatch.mutate(invitation.id));

    await waitFor(() => expect(result.current.leaveMatch.isError).toBe(true));
    expect(client.getQueryData(listKey)).toEqual([detail.match]);
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("leave_match");
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "leave_match");
  });

  it("optimistically updates every match cache and reconciles the server response", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const listKey = ["matches", "https://api.example.com", "token"];
    const detailKey = ["matches", "detail", invitation.matchId, "https://api.example.com", "token"];
    client.setQueryData(listKey, [detail.match]);
    client.setQueryData(detailKey, detail);
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    let finishUpdate = () => {};
    let serverMatch = detail.match;
    const updated = {
      ...detail.match,
      name: "Updated game night",
      dates: ["2026-10-01T18:00:00.000Z"],
      invitedUserIds: [],
      invitations: [],
      gameIds: [2],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Promise<Response>((resolve) => {
            finishUpdate = () => {
              serverMatch = updated;
              resolve(new Response(JSON.stringify({ match: updated }), { status: 200 }));
            };
          });
        }
        return Promise.resolve(
          new Response(JSON.stringify({ matches: [serverMatch] }), { status: 200 }),
        );
      }),
    );

    const { result } = renderHook(
      () =>
        useMatches({
          apiUrl: "https://api.example.com",
          token: "token",
          userId: "user_admin",
          feedback,
        }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => {
      result.current.update.mutate({
        matchId: invitation.matchId,
        input: {
          name: updated.name,
          dates: updated.dates,
          minPlayers: 2,
          maxPlayers: 4,
          invitedUserIds: [],
          gameIds: [2],
        },
      });
    });

    await waitFor(() => expect(result.current.list.data?.[0]?.name).toBe(updated.name));
    expect((client.getQueryData(detailKey) as typeof detail).invitedPlayers).toEqual([]);
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("update_match");
    finishUpdate();
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    expect(result.current.list.data?.[0]?.invitations).toEqual([]);
    expect(feedback.onError).not.toHaveBeenCalled();
  });

  it("rolls a failed match update back before danger feedback", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "PATCH"
            ? new Response("failed", { status: 500 })
            : new Response(JSON.stringify({ matches: [detail.match] }), { status: 200 }),
        ),
      ),
    );
    const { result } = renderHook(
      () =>
        useMatches({
          apiUrl: "https://api.example.com",
          token: "token",
          userId: "user_admin",
          feedback,
        }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => {
      result.current.update.mutate({
        matchId: invitation.matchId,
        input: { name: "Updated game night" },
      });
    });
    await waitFor(() => expect(result.current.update.isError).toBe(true));

    expect(result.current.list.data?.[0]?.name).toBe(detail.match.name);
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("update_match");
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "update_match");
  });

  it("optimistically creates a match and rolls it back on failure", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    let failCreate = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Promise<Response>((resolve) => {
            failCreate = () => resolve(new Response("failed", { status: 500 }));
          });
        }
        return Promise.resolve(new Response(JSON.stringify({ matches: [] }), { status: 200 }));
      }),
    );

    const { result } = renderHook(
      () =>
        useMatches({
          apiUrl: "https://api.example.com",
          token: "token",
          userId: "user_admin",
          feedback,
        }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => {
      result.current.create.mutate({
        name: "Friday night games",
        dates: ["2026-09-12T18:00:00.000Z"],
        minPlayers: 2,
        maxPlayers: 4,
        invitedUserIds: [],
        gameIds: [1],
      });
    });

    await waitFor(() => expect(result.current.list.data?.[0]?.optimistic).toBe(true));
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("create_match");
    failCreate();
    await waitFor(() => expect(result.current.create.isError).toBe(true));
    expect(result.current.list.data).toEqual([]);
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "create_match");
  });
});
