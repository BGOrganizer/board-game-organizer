import {
  eventRecordQuery,
  eventRecordsQuery,
  groupRecordsPageQuery,
  recordTablesQuery,
} from "@board-game-organizer/shared";
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
vi.mock("next/navigation", () => ({ usePathname: () => "/tables" }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("warms only first pages with shared canonical identities, then two bounded event details", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const body = url.pathname.endsWith("/profiles")
      ? { id: "user_1" }
      : url.pathname.endsWith("/tables")
        ? { items: ["one", "two", "three"].map((id) => ({ id, eventId: id })), nextCursor: "later" }
        : url.pathname.endsWith("/groups") || url.pathname.endsWith("/events")
          ? { items: [], nextCursor: "later" }
          : url.pathname.includes("/events/")
            ? { id: url.pathname.split("/").at(-1) }
            : url.pathname.endsWith("/suggestions")
              ? { users: [], hasContacts: false, nextCursor: "later" }
              : { rows: [], nextCursor: "later" };
    return new Response(JSON.stringify(body));
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    o = { apiUrl: "https://api.example.test", userId: "user_1", getToken: async () => null };
  render(
    <QueryClientProvider client={client}>
      <WebDataWarmup />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(client.getQueryData(["contacts", "suggestions", o.apiUrl, o.userId])).toBeDefined(),
  );
  for (const key of [
    recordTablesQuery(o, null).queryKey,
    groupRecordsPageQuery(o).queryKey,
    eventRecordsQuery(o).queryKey,
  ])
    expect(client.getQueryData(key)).toBeDefined();
  for (const type of ["friends", "pending", "following", "followers", "sent", "blocked"])
    expect(client.getQueryData(["contacts", type, o.apiUrl, o.userId])).toBeDefined();
  await waitFor(() =>
    expect(client.getQueryData(eventRecordQuery(o, "two").queryKey)).toBeDefined(),
  );
  expect(client.getQueryData(eventRecordQuery(o, "three").queryKey)).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(13);
  expect(fetch.mock.calls.every(([url]) => !String(url).includes("cursor="))).toBe(true);
  client.clear();
});
