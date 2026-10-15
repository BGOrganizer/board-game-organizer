import { useBggAccount } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("reads BGG account with a fresh token and rolls back failed unlink", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const active = {
    id: 42,
    username: "alice",
    avatarUrl: null,
    snapshot: "snap",
    syncedAt: "2026-09-01T00:00:00.000Z",
  };
  let rejectDelete: ((error: Error) => void) | undefined;
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    init?.method === "DELETE"
      ? new Promise<Response>((_resolve, reject) => {
          rejectDelete = reject;
        })
      : Promise.resolve(new Response(JSON.stringify({ active, pending: null }), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  const getToken = vi.fn().mockResolvedValueOnce("fresh-1").mockResolvedValue("fresh-2");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useBggAccount({ apiUrl: "https://api.example.com", userId: "owner", getToken }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.account.data?.active?.username).toBe("alice"));
  act(() => result.current.unlink.mutate());
  await waitFor(() => expect(result.current.account.data?.active).toBeNull());
  await waitFor(() => expect(rejectDelete).toBeDefined());
  await act(async () => rejectDelete?.(new Error("network")));
  await waitFor(() => expect(result.current.account.data?.active?.username).toBe("alice"));
  expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers)).toEqual([
    expect.objectContaining({ Authorization: "Bearer fresh-1" }),
    expect.objectContaining({ Authorization: "Bearer fresh-2" }),
  ]);
});
