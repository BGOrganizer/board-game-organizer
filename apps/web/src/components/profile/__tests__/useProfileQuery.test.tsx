import { useProfileQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("refreshes Clerk token for each profile request", async () => {
  const getToken = vi
    .fn()
    .mockResolvedValueOnce("first")
    .mockResolvedValueOnce("rotated")
    .mockResolvedValueOnce(null);
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    json: async () => ({ id: "user_1" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useProfileQuery({ apiUrl: "https://api.example.com", userId: "user_1", getToken }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await act(async () => {
    await result.current.refetch();
  });
  expect(fetchMock.mock.calls.map(([, init]) => init?.headers)).toEqual([
    { Authorization: "Bearer first", "Content-Type": "application/json" },
    { Authorization: "Bearer rotated", "Content-Type": "application/json" },
  ]);
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 2500 });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
