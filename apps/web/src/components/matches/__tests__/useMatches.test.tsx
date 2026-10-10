import { useMatchDetail, useMatches, useMatchLeaderboard } from "@board-game-organizer/shared";
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

describe("useMatchLeaderboard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads only selected games with fresh JWTs and separate cache keys", async () => {
    const getToken = vi.fn().mockResolvedValueOnce("fresh-one").mockResolvedValueOnce("fresh-two");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ gameId: 1, ratings: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const options = {
      apiUrl: "https://api.example.com",
      token: "old-token",
      getToken,
      userId: "user_admin",
      matchId: invitation.matchId,
      protectionBypass: "bypass",
    };
    const { result, rerender } = renderHook(({ gameId }) => useMatchLeaderboard(options, gameId), {
      initialProps: { gameId: null as number | null },
      wrapper: wrapper(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ gameId: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/matches/${invitation.matchId}/leaderboard?gameId=1&x-vercel-protection-bypass=bypass`,
      { headers: expect.objectContaining({ Authorization: "Bearer fresh-one" }) },
    );
    rerender({ gameId: 2 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://api.example.com/api/matches/${invitation.matchId}/leaderboard?gameId=2&x-vercel-protection-bypass=bypass`,
      { headers: expect.objectContaining({ Authorization: "Bearer fresh-two" }) },
    );
    expect(getToken).toHaveBeenCalledTimes(2);
  });
});

describe("useMatchDetail join requests", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["request", "approve"] as const)(
    "optimistically handles %s, restores snapshots on failure and uses fresh tokens",
    async (mode) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const options = {
        apiUrl: "https://api.example.com",
        token: "old",
        getToken: vi.fn().mockResolvedValue("fresh"),
        userId: "user_admin",
        matchId: invitation.matchId,
        protectionBypass: "bypass",
        feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() },
      };
      let rejectWrite = () => {};
      const data = { ...detail, canRequestJoin: true };
      const fetchMock = vi.fn((_url: unknown, init?: RequestInit) =>
        init?.method
          ? new Promise<Response>((resolve) => {
              rejectWrite = () => resolve(new Response("error", { status: 409 }));
            })
          : Promise.resolve(new Response(JSON.stringify(data))),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { result } = renderHook(() => useMatchDetail(options), { wrapper: wrapper(client) });
      await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
      const foreignKey = [
        "matches",
        "detail",
        "https://other.example.com",
        "user_other",
        invitation.matchId,
      ];
      client.setQueryData(foreignKey, data);
      act(() => {
        if (mode === "request") result.current.requestJoin.mutate();
        else result.current.approveJoinRequest.mutate(invitation.id);
      });
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/join-requests"),
          expect.objectContaining({
            method: mode === "request" ? "POST" : "PATCH",
            headers: expect.objectContaining({ Authorization: "Bearer fresh" }),
          }),
        ),
      );
      if (mode === "request") expect(result.current.detail.data?.canRequestJoin).toBe(false);
      else expect(result.current.detail.data?.match.invitations[0]?.status).toBe("ACCEPTED");
      expect(client.getQueryData(foreignKey)).toEqual(data);
      rejectWrite();
      await waitFor(() =>
        expect(
          mode === "request"
            ? result.current.requestJoin.isError
            : result.current.approveJoinRequest.isError,
        ).toBe(true),
      );
      expect(result.current.detail.data?.match.invitations[0]?.status).toBe("PENDING");
      expect(result.current.detail.data?.canRequestJoin).toBe(true);
      expect(options.feedback.onError).toHaveBeenCalledWith(
        expect.any(Error),
        mode === "request" ? "request_match_join" : "approve_match_join",
      );
    },
  );
  it("does not fall back to a stale JWT when fresh authentication fails", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { result } = renderHook(
      () =>
        useMatchDetail({
          apiUrl: "",
          token: "snapshot",
          getToken: async () => null,
          matchId: invitation.matchId,
        }),
      { wrapper: wrapper() },
    );
    await act(async () => {
      await expect(result.current.requestJoin.mutateAsync()).rejects.toThrow("No session token");
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("supports legacy token callers and successful writes without cached detail", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ invitation })));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(
      () => useMatchDetail({ apiUrl: "", token: "token", matchId: invitation.matchId }),
      { wrapper: wrapper() },
    );
    await act(async () => {
      await result.current.requestJoin.mutateAsync();
      await result.current.approveJoinRequest.mutateAsync(invitation.id);
    });
    await waitFor(() => expect(result.current.approveJoinRequest.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

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

  it("refreshes vote counts and confirmation readiness after a saved choice", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const key = String(Date.parse(detail.match.dates[0]));
    const counts = { yes: 1, no: 0, ifNeeded: 0, notChosen: 0 };
    let summary = { dates: { [key]: counts }, games: { "1": counts }, reasons: ["NO_SHARED_DATE"] };
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          summary = { ...summary, reasons: [] };
          return Promise.resolve(
            new Response(JSON.stringify({ match: detail.match }), { status: 200 }),
          );
        }
        reads++;
        return Promise.resolve(
          new Response(JSON.stringify({ ...detail, voteSummary: summary }), { status: 200 }),
        );
      }),
    );
    const { result } = renderHook(
      () =>
        useMatchDetail({
          apiUrl: "https://api.example.com",
          token: "token",
          getToken: async () => "token",
          matchId: invitation.matchId,
        }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() =>
      expect(result.current.detail.data?.voteSummary?.reasons).toEqual(["NO_SHARED_DATE"]),
    );
    act(() =>
      result.current.setChoice.mutate({
        kind: "dates",
        itemId: detail.match.dates[0],
        choice: "YES",
      }),
    );
    await waitFor(() => expect(result.current.detail.data?.voteSummary?.reasons).toEqual([]));
    expect(reads).toBeGreaterThan(1);
  });

  it("optimistically transitions status, confirms server selection, and rolls back a failed reopen", async () => {
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let serverDetail = detail;
    let finishPatch = (_response: Response) => {};
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Promise<Response>((resolve) => {
            finishPatch = resolve;
          })
        : Promise.resolve(new Response(JSON.stringify(serverDetail), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(
      () =>
        useMatchDetail({
          apiUrl: "https://api.example.com",
          token: "initial",
          getToken: async () => "fresh-token",
          feedback,
          matchId: invitation.matchId,
        }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.detail.data?.match.status).toBe("PLANNING"));
    act(() => result.current.setStatus.mutate("CREATED"));
    await waitFor(() => expect(result.current.detail.data?.match.status).toBe("CREATED"));
    expect(result.current.detail.data?.invitedPlayers).toEqual([]);
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("create_match_status");
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/matches/${invitation.matchId}/status`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "CREATED" }),
        headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
      }),
    );
    const created = {
      ...detail.match,
      status: "CREATED",
      selectedDate: detail.match.dates[0],
      selectedLocationId: "8b1f8d7e-b32b-4c56-b0de-190748935516",
      selectedGameId: 1,
      invitedUserIds: [],
      invitations: [],
    };
    serverDetail = { ...detail, match: created, invitedPlayers: [] };
    finishPatch(new Response(JSON.stringify({ match: created }), { status: 200 }));
    await waitFor(() => expect(result.current.setStatus.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.detail.data?.match.selectedGameId).toBe(1));
    act(() => result.current.setStatus.mutate("PLANNING"));
    await waitFor(() => expect(result.current.detail.data?.match.status).toBe("PLANNING"));
    expect(result.current.detail.data?.match.selectedLocationId).toBeUndefined();
    finishPatch(new Response("error", { status: 409 }));
    await waitFor(() => expect(result.current.setStatus.isError).toBe(true));
    expect(result.current.detail.data?.match.status).toBe("CREATED");
    expect(result.current.detail.data?.match.selectedLocationId).toBe(created.selectedLocationId);
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "replan_match");
  });

  it("optimistically registers results, rolls back failures and refreshes from server", async () => {
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const created = { ...detail.match, status: "CREATED" as const };
    let serverDetail: unknown = { ...detail, match: created };
    let finishPost = (_response: Response) => {};
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST"
        ? new Promise<Response>((resolve) => {
            finishPost = resolve;
          })
        : Promise.resolve(new Response(JSON.stringify(serverDetail), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(
      () =>
        useMatchDetail({
          apiUrl: "https://api.example.com",
          token: "initial",
          getToken: async () => "fresh-token",
          feedback,
          matchId: invitation.matchId,
        }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.detail.data?.match.status).toBe("CREATED"));
    const input = {
      lowerWins: true,
      entries: [{ userId: "user_admin", score: "-1.5" }],
      tieBreaks: [],
    };
    act(() => result.current.registerResults.mutate(input));
    await waitFor(() => expect(result.current.detail.data?.match.status).toBe("TERMINATED"));
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("register_match_results");
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/api/matches/${invitation.matchId}/results`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
        headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
      }),
    );
    finishPost(new Response("error", { status: 409 }));
    await waitFor(() => expect(result.current.registerResults.isError).toBe(true));
    expect(result.current.detail.data?.match.status).toBe("CREATED");
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "register_match_results");
    const registered = {
      ...created,
      status: "TERMINATED" as const,
      results: {
        ...input,
        entries: [{ ...input.entries[0], rank: 1 }],
        finalizedAt: new Date().toISOString(),
      },
    };
    serverDetail = { ...detail, match: registered };
    act(() => result.current.registerResults.mutate(input));
    await waitFor(() => expect(result.current.detail.data?.match.status).toBe("TERMINATED"));
    finishPost(new Response(JSON.stringify({ match: registered }), { status: 200 }));
    await waitFor(() => expect(result.current.registerResults.isSuccess).toBe(true));
    expect(result.current.detail.data?.match.results).toEqual(registered.results);
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

  it.each([200, 500])(
    "removes a player optimistically and %s reconciles or rolls back",
    async (status) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const listKey = ["matches", "https://api.example.com", "initial-token"];
      client.setQueryData(listKey, [detail.match]);
      const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
      let release: (response: Response) => void = () => {};
      const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
        init?.method === "DELETE"
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : Promise.resolve(new Response(JSON.stringify(detail), { status: 200 })),
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
      act(() => result.current.removePlayer.mutate(invitation.id));
      await waitFor(() =>
        expect((client.getQueryData(listKey) as (typeof detail.match)[])[0]?.invitations).toEqual(
          [],
        ),
      );
      expect((client.getQueryData(listKey) as (typeof detail.match)[])[0]?.invitedUserIds).toEqual(
        [],
      );
      expect(result.current.detail.data?.invitedPlayers).toEqual([]);
      expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("remove_match_player");
      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.example.com/api/matches/${invitation.matchId}/invitations/${invitation.id}`,
        expect.objectContaining({
          method: "DELETE",
          headers: { Authorization: "Bearer fresh-token" },
        }),
      );
      act(() => release(new Response(null, { status })));
      await waitFor(() =>
        expect(
          status === 200
            ? result.current.removePlayer.isSuccess
            : result.current.removePlayer.isError,
        ).toBe(true),
      );
      if (status !== 200) {
        expect((client.getQueryData(listKey) as (typeof detail.match)[])[0]?.invitations).toEqual([
          invitation,
        ]);
        expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "remove_match_player");
      }
    },
  );

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
        locations: [
          {
            id: "8b1f8d7e-b32b-4c56-b0de-190748935516",
            name: "Game cafe",
            address: "123 Main St",
            longitude: 12.5,
            latitude: 41.9,
          },
        ],
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
