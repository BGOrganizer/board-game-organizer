import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebDataWarmup } from "../WebDataWarmup";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    userId: "user_1",
    sessionId: "sess_1",
    getToken: async () => "fresh-jwt",
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("warms first pages under stable user keys without fetching later pages", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const body = url.pathname.endsWith("/profiles")
      ? { id: "user_1" }
      : url.pathname.endsWith("/matches")
        ? { matches: ["one", "two", "three"].map((id) => ({ id })), nextCursor: "later" }
        : url.pathname.includes("/matches/")
          ? { id: url.pathname.split("/").at(-1) }
          : url.pathname.endsWith("/groups")
            ? { groups: [], nextCursor: "later" }
            : url.pathname.endsWith("/suggestions")
              ? { users: [], hasContacts: false, nextCursor: "later" }
              : { rows: [], nextCursor: "later" };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WebDataWarmup />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      client.getQueryData(["contacts", "suggestions", "https://api.example.test", "user_1"]),
    ).toBeDefined(),
  );
  expect(client.getQueryData(["profile", "https://api.example.test", "user_1"])).toBeDefined();
  for (const type of ["matches", "groups"])
    expect(
      client.getQueryData([
        type,
        "paged",
        "https://api.example.test",
        "user_1",
        "",
        "admin,invited,accepted",
      ]),
    ).toBeDefined();
  for (const type of ["friends", "pending", "following", "followers", "sent", "blocked"])
    expect(
      client.getQueryData(["contacts", type, "https://api.example.test", "user_1"]),
    ).toBeDefined();
  await waitFor(() =>
    expect(
      client.getQueryData(["matches", "detail", "two", "https://api.example.test", "user_1"]),
    ).toBeDefined(),
  );
  expect(
    client.getQueryData(["matches", "detail", "three", "https://api.example.test", "user_1"]),
  ).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(12);
  expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("cursor="))).toBe(true);
});
