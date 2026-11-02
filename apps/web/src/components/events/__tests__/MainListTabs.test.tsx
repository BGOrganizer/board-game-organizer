import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

it("keeps My events and Available source pages separate, with contextual Group lists unsplit", async () => {
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
    const items = u.pathname.endsWith("/events")
      ? u.searchParams.get("section") === "available"
        ? [available]
        : [mine]
      : [];
    return Response.json({ items, nextCursor: null });
  });
  vi.stubGlobal("fetch", fetcher);
  const ui = render(<Events canCreate={false} />);
  await screen.findByRole("link", { name: "Open event: My invitation" });
  expect(screen.queryByRole("link", { name: "Open event: Own administration" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Available" }));
  await screen.findByRole("link", { name: "Open event: Own administration" });
  expect(screen.queryByRole("link", { name: "Open event: My invitation" })).toBeNull();
  expect(
    fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("section") === "available"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: "My events" }));
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

it("uses My tables only for seats/demonstration and Pending for invitations, historical requests and queue, never admin-only", async () => {
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
  const admin = { ...plannedTable, id: "admin", name: "Admin only table", myRegistration: null };
  const fetcher = vi.fn(async (url: string) =>
    Response.json({
      items:
        new URL(url).searchParams.get("section") === "waiting"
          ? [invited, requested, queued, admin]
          : [seated, demo, admin],
      nextCursor: null,
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<Tables />);
  await screen.findByRole("link", { name: "Open table: Seated table" });
  expect(screen.getByRole("link", { name: "Open table: Demonstration table" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Open table: Admin only table" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Open table: Invited table" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Table legend" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("tab", { name: "Pending" }));
  await screen.findByRole("link", { name: "Open table: Invited table" });
  for (const name of ["Requested table", "Queued table"])
    expect(screen.getByRole("link", { name: `Open table: ${name}` })).toBeTruthy();
  for (const name of ["Admin only table", "Seated table", "Demonstration table"])
    expect(screen.queryByRole("link", { name: `Open table: ${name}` })).toBeNull();
  const input = screen.getByRole("searchbox", { name: "Filter" });
  expect(input.getAttribute("placeholder")).toBe("Filter tables");
  fireEvent.change(input, { target: { value: "q" } });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) => {
        const p = new URL(url).searchParams;
        return p.get("query") === "q" && p.get("section") === "waiting";
      }),
    ).toBe(true),
  );
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
  expect((input as HTMLInputElement).value).toBe("");
});

it("keeps pending-section errors observable and retries/paginates only that section", async () => {
  let fail = true;
  const fetcher = vi.fn(async (url: string) => {
    const p = new URL(url).searchParams;
    if (p.get("section") !== "waiting") return Response.json({ items: [], nextCursor: null });
    if (fail) return Response.json({}, { status: 503 });
    return Response.json({
      items: [
        {
          ...plannedTable,
          id: p.has("cursor") ? "second" : "first",
          name: p.has("cursor") ? "Second waiting" : "First waiting",
          myRegistration: { ...seat("owner"), status: "PENDING" },
        },
      ],
      nextCursor: p.has("cursor") ? null : "next",
    });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<Tables />);
  await screen.findByText("No tables found");
  fireEvent.click(screen.getByRole("tab", { name: "Pending" }));
  await screen.findByText("Could not load tables");
  expect(screen.queryByText("No tables found")).toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: "Open table: First waiting" });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByRole("link", { name: "Open table: Second waiting" });
  expect(
    fetcher.mock.calls.some(([url]) => {
      const p = new URL(url).searchParams;
      return p.get("section") === "waiting" && p.get("cursor") === "next";
    }),
  ).toBe(true);
});
