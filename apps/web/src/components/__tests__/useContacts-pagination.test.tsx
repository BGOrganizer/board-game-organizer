import { useContacts } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("loads social and BGO contacts one page at a time with a fresh JWT", async () => {
  const getToken = vi.fn(async () => "fresh-jwt");
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const cursor = url.searchParams.get("cursor");
    const user = (id: string) => ({
      id,
      name: id,
      email: null,
      avatarUrl: null,
      presence: { online: false, lastActiveAt: "" },
    });
    const body = url.pathname.endsWith("/suggestions")
      ? {
          users: [user(cursor ? "user_b" : "user_a")],
          nextCursor: cursor ? null : "user_a",
          hasContacts: true,
        }
      : url.searchParams.get("type") === "friends"
        ? {
            rows: [
              {
                fromUserId: "viewer",
                toUserId: cursor ? "user_b" : "user_a",
                profile: user(cursor ? "user_b" : "user_a"),
              },
            ],
            nextCursor: cursor ? null : "user_a",
          }
        : { rows: [], nextCursor: null };
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer fresh-jwt" }));
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useContacts("https://api.example.test", "old-jwt", getToken, undefined, "viewer"),
    { wrapper },
  );
  await waitFor(() =>
    expect(result.current.friends.data?.map((row) => row.toUserId)).toEqual(["user_a"]),
  );
  await waitFor(() =>
    expect(result.current.suggestions.data?.users.map((user) => user.id)).toEqual(["user_a"]),
  );
  expect(result.current.friends.hasNextPage).toBe(true);
  await act(async () => {
    await Promise.all([
      result.current.friends.fetchNextPage(),
      result.current.suggestions.fetchNextPage(),
    ]);
  });
  await waitFor(() =>
    expect(result.current.friends.data?.map((row) => row.toUserId)).toEqual(["user_a", "user_b"]),
  );
  await waitFor(() =>
    expect(result.current.suggestions.data?.users.map((user) => user.id)).toEqual([
      "user_a",
      "user_b",
    ]),
  );
  expect(result.current.suggestions.hasNextPage).toBe(false);
  expect(
    fetchMock.mock.calls.filter(([url]) => String(url).includes("cursor=user_a")),
  ).toHaveLength(2);
});
