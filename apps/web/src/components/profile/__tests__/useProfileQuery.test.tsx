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

it("reports the HTTP profile failure and recovers with a fresh authenticated read", async () => {
  let status = 503;
  const fields = { id: "user_1", firstName: "Profile" };
  const getToken = vi
    .fn()
    .mockResolvedValueOnce("first")
    .mockResolvedValueOnce("automatic-retry")
    .mockResolvedValueOnce("rotated");
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    expect(new URL(input).pathname).toBe("/api/profiles");
    expect(init?.method ?? "GET").toBe("GET");
    return Response.json(status === 200 ? fields : { error: "Unavailable" }, { status });
  });
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => useProfileQuery({ apiUrl: "https://api.example.com", userId: "user_1", getToken }),
    { wrapper },
  );
  await waitFor(() => expect(view.result.current.error).toMatchObject({ message: "HTTP 503" }), {
    timeout: 5000,
  });
  expect(view.result.current.data).toBeUndefined();
  status = 200;
  await act(async () => {
    await view.result.current.refetch();
  });
  await waitFor(() => expect(view.result.current.data).toEqual(fields));
  expect(
    fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get("authorization")),
  ).toEqual(["Bearer first", "Bearer automatic-retry", "Bearer rotated"]);
  view.unmount();
  client.clear();
});
