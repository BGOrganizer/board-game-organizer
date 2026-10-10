import type { EventResponse } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { Events } from "../Events";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "viewer",
    getToken: async () => "fresh",
  }),
}));
const row: EventResponse = {
  adminUserId: "viewer",
  version: 1,
  role: "admin",
  canModify: true,
  canPublish: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  location: {
    id: "address",
    name: "Game club",
    address: "Verified street 1",
    longitude: 12,
    latitude: 45,
  },
  logo: "",
  id: "event",
  organizationId: "org",
  name: "Board evening",
  organizationName: "Game club",
  startsAt: "2030-01-01T18:00:00.000Z",
  endsAt: "2030-01-01T22:00:00.000Z",
  bookingClosesAt: "2029-12-31T18:00:00.000Z",
  timeZone: "UTC",
  status: "PUBLISHED",
  tableCount: 1,
  organizationApproved: true,
  confirmedParticipantCount: 3,
};
function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <Events />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("has no global creation action and sends selected period filters instead of filtering loaded pages", async () => {
  const fetch = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams;
    const periods = params.get("periods")?.split(",") ?? ["future", "past"];
    return new Response(
      JSON.stringify({ items: periods.includes("future") ? [row] : [], nextCursor: null }),
    );
  });
  vi.stubGlobal("fetch", fetch);
  render();
  await screen.findByText(row.name);
  expect(screen.queryByRole("link", { name: "New event" })).toBeNull();
  expect(screen.getByRole("searchbox", { name: "Search events" }).getAttribute("placeholder")).toBe(
    "Search events",
  );
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Future" }));
  await screen.findByText("No events found");
  expect(new URL(fetch.mock.calls.at(-1)?.[0] ?? "").searchParams.get("periods")).toBe("past");
  fireEvent.click(screen.getByRole("button", { name: "Past" }));
  await waitFor(() =>
    expect(new URL(fetch.mock.calls.at(-1)?.[0] ?? "").searchParams.get("periods")).toBe(""),
  );
  fireEvent.click(screen.getByRole("button", { name: "Future" }));
  await screen.findByText(row.name);
});
it("reports initial list failure and retry recovery without turning errors into empty results", async () => {
  let failed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      failed
        ? new Response('{"error":"UNAVAILABLE"}', { status: 503 })
        : new Response(JSON.stringify({ items: [row], nextCursor: null })),
    ),
  );
  render();
  await screen.findByText("Could not load events");
  expect(screen.queryByText("No events found")).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText(row.name);
  expect(screen.queryByText("Could not load events")).toBeNull();
});
