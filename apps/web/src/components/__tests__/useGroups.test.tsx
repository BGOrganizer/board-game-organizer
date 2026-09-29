import { useGroups } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const group = {
  id: "11111111-1111-4111-8111-111111111111",
  adminUserId: "admin",
  name: "Board Gamers",
  isPublic: false,
  memberCount: 2,
  memberProfiles: [
    { id: "admin", name: "Admin", email: null, avatarUrl: null },
    { id: "friend", name: "Friend", email: null, avatarUrl: null },
  ],
  invitations: [
    {
      id: "invite",
      groupId: "11111111-1111-4111-8111-111111111111",
      inviteeUserId: "friend",
      status: "ACCEPTED",
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
    },
  ],
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
};

afterEach(() => vi.unstubAllGlobals());

it("shows admin and accepted members from invitation response before groups refetch", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pending = {
    ...group,
    memberCount: 1,
    memberProfiles: [],
    invitations: group.invitations.map((invitation) => ({ ...invitation, status: "PENDING" })),
  };
  let fetches = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH")
        return Promise.resolve(new Response(JSON.stringify({ group }), { status: 200 }));
      if (fetches++ === 0)
        return Promise.resolve(
          new Response(JSON.stringify({ groups: [pending] }), { status: 200 }),
        );
      return new Promise<Response>(() => {}); // Keep invalidation refetch pending to verify response cache.
    }),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      useGroups({
        apiUrl: "https://api.example.com",
        token: "old-token",
        getToken: vi.fn().mockResolvedValue("fresh-token"),
        userId: "friend",
      }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.list.data?.[0].memberProfiles).toEqual([]));
  act(() => result.current.respond.mutate({ invitationId: "invite", decision: "accept" }));
  await waitFor(() =>
    expect(result.current.list.data?.[0].memberProfiles.map((person) => person.id)).toEqual([
      "admin",
      "friend",
    ]),
  );
  expect(result.current.list.data?.[0].invitations[0].status).toBe("ACCEPTED");
});

it("optimistically removes accepted group member and rolls back on failed DELETE", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
  const getToken = vi.fn().mockResolvedValue("fresh-token");
  let failRequest = () => {};
  const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
    init?.method === "DELETE"
      ? new Promise<Response>((resolve) => {
          failRequest = () => resolve(new Response("error", { status: 409 }));
        })
      : Promise.resolve(new Response(JSON.stringify({ groups: [group] }), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useGroups({ apiUrl: "https://api.example.com", token: "old-token", getToken, feedback }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.list.data).toHaveLength(1));
  act(() => result.current.removeInvitation.mutate("invite"));
  await waitFor(() => expect(result.current.list.data?.[0].memberCount).toBe(1));
  expect(result.current.list.data?.[0].memberProfiles).toHaveLength(1);
  expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("remove_group_invitation");
  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.example.com/api/group-invitations/invite",
    expect.objectContaining({
      method: "DELETE",
      headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
    }),
  );
  failRequest();
  await waitFor(() => expect(result.current.removeInvitation.isError).toBe(true));
  expect(result.current.list.data?.[0].memberCount).toBe(2);
  expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "remove_group_invitation");
});
