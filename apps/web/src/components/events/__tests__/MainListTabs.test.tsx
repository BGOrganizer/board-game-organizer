import { emptyAttentionSummary } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { Events } from "../Events";
import { Tables } from "../Tables";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
afterEach(() => vi.unstubAllGlobals());
const render = (child: ReactNode) =>
  renderWithI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {child}
    </QueryClientProvider>,
  );
function attention(url: URL, unread = false) {
  if (!url.pathname.endsWith("/notifications/attention")) return undefined;
  return Response.json({
    asOf: "2030-01-01T00:00:00.000Z",
    unreadCount: unread ? 2 : 0,
    summary: emptyAttentionSummary(),
    targets: JSON.parse(url.searchParams.get("targets") ?? "[]").map(
      (target: { kind: string; id: string }) => ({
        target,
        count: unread && target.kind === "event-list" && target.id === "mine" ? 1 : 0,
        direct: 0,
        events: 0,
        sections: { connections: 0, requests: 0, search: 0 },
      }),
    ),
  });
}

it("keeps Registered and Available source pages separate, with Group context unsplit", async () => {
  const mine = {
    ...plannedEvent,
    name: "My invitation",
    myRegistrations: [{ ...seat("owner"), status: "PENDING" as const }],
  };
  const available = {
    ...plannedEvent,
    id: "available",
    name: "Own administration",
    myRegistrations: [],
  };
  const fetcher = vi.fn(async (url: string) => {
    const u = new URL(url);
    return (
      attention(u, true) ??
      Response.json({
        items: u.pathname.endsWith("/events")
          ? u.searchParams.get("section") === "available"
            ? [available]
            : [mine]
          : [],
        nextCursor: null,
      })
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const ui = render(<Events canCreate={false} />);
  await screen.findByRole("link", { name: "Open event: My invitation" });
  expect(screen.queryByRole("link", { name: "Open event: Own administration" })).toBeNull();
  const registered = screen.getByRole("tab", { name: /Registered/ });
  await waitFor(() =>
    expect(within(registered).getByRole("img", { name: "Needs attention" })).toBeTruthy(),
  );
  expect(
    within(screen.getByRole("tab", { name: "Available" })).queryByRole("img", {
      name: "Needs attention",
    }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Available" }));
  await screen.findByRole("link", { name: "Open event: Own administration" });
  expect(screen.queryByRole("link", { name: "Open event: My invitation" })).toBeNull();
  expect(
    fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("section") === "available"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: /Registered/ }));
  await screen.findByRole("link", { name: "Open event: My invitation" });
  ui.unmount();
  render(<Events groupId="club" canCreate={false} />);
  await screen.findByRole("link", { name: "Open event: My invitation" });
  expect(screen.queryByRole("tablist", { name: "Events navigation" })).toBeNull();
  expect(
    fetcher.mock.calls.some(([url]) => {
      const p = new URL(url).searchParams;
      return p.get("groupId") === "club" && !p.has("section");
    }),
  ).toBe(true);
});

it("combines seats, demonstrations, invitations, requests and queue in one source-paged list, never admin-only", async () => {
  const seated = {
    ...plannedTable,
    id: "seated",
    name: "Seated table",
    myRegistration: seat("owner"),
    myPosition: "SEATED",
  };
  const demo = {
    ...plannedTable,
    id: "demo",
    name: "Demonstration table",
    demonstratorUserId: "owner",
  };
  const invited = {
    ...plannedTable,
    id: "invited",
    name: "Invited table",
    myRegistration: { ...seat("owner"), status: "PENDING" },
  };
  const requested = {
    ...invited,
    id: "requested",
    name: "Requested table",
    myRegistration: { ...invited.myRegistration, kind: "SELF" },
  };
  const queued = { ...seated, id: "queue", name: "Queued table", myPosition: "WAITING" };
  const unknown = {
    ...seated,
    id: "unknown",
    name: "Position not yet loaded",
    myPosition: undefined,
  };
  const admin = { ...plannedTable, id: "admin", name: "Admin only table", myRegistration: null };
  const fetcher = vi.fn(
    async (url: string) =>
      attention(new URL(url)) ??
      Response.json({
        items: [seated, demo, invited, requested, queued, unknown, admin],
        nextCursor: null,
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<Tables />);
  await screen.findByRole("link", { name: "Open table: Seated table" });
  for (const name of [
    "Demonstration table",
    "Invited table",
    "Requested table",
    "Queued table",
    "Position not yet loaded",
  ])
    expect(screen.getByRole("link", { name: `Open table: ${name}` })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Open table: Admin only table" })).toBeNull();
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.getAllByRole("button", { name: "Table legend" })).toHaveLength(1);
  const input = screen.getByRole("searchbox", { name: "Filter" });
  expect(input.getAttribute("placeholder")).toBe("Filter tables");
  fireEvent.change(input, { target: { value: "q" } });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) => {
        const u = new URL(url);
        return (
          u.pathname.endsWith("/tables") &&
          u.searchParams.get("query") === "q" &&
          !u.searchParams.has("section")
        );
      }),
    ).toBe(true),
  );
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
  expect((input as HTMLInputElement).value).toBe("");
});

it("keeps combined-list errors observable and retries/paginates the same canonical source", async () => {
  let fail = true;
  const fetcher = vi.fn(async (url: string) => {
    const u = new URL(url),
      scope = attention(u);
    if (scope) return scope;
    if (fail) return Response.json({}, { status: 503 });
    return Response.json({
      items: [
        {
          ...plannedTable,
          id: u.searchParams.has("cursor") ? "second" : "first",
          name: u.searchParams.has("cursor") ? "Second waiting" : "First waiting",
          myRegistration: { ...seat("owner"), status: "PENDING" },
        },
      ],
      nextCursor: u.searchParams.has("cursor") ? null : "next",
    });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Tables />);
  await screen.findByText("Could not load tables");
  expect(screen.queryByText("No tables found")).toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: "Open table: First waiting" });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("link", { name: "Open table: Second waiting" });
  expect(
    fetcher.mock.calls.some(([url]) => {
      const u = new URL(url);
      return (
        u.pathname.endsWith("/tables") &&
        !u.searchParams.has("section") &&
        u.searchParams.get("cursor") === "next"
      );
    }),
  ).toBe(true);
});

it("keeps combined-list empty state without unnecessary navigation", async () => {
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      attention(new URL(url)) ?? Response.json({ items: [], nextCursor: null }),
  );
  render(<Tables />);
  await screen.findByText("No tables found");
  expect(screen.queryByRole("tablist")).toBeNull();
});
