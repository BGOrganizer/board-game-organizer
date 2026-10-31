import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { groupRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  eventId,
  groupRecord,
  optionId,
  plannedEvent,
  plannedTable,
  seat,
  tableId,
} from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";
import { EventDetail } from "../EventDetail";
import { EventGroupLink } from "../EventGroupLink";
import { EventTableCard } from "../EventTableCard";
import { EventTableOverview } from "../EventTableOverview";

const options = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());
const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lc8AAAAASUVORK5CYII=";
function setup(full = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const group = { ...groupRecord, logo };
  const event = { ...plannedEvent, groupId: group.id, groupName: group.name };
  const rows = full
    ? [
        { ...seat("first"), id: optionId },
        { ...seat("second"), id: "44444444-4444-4444-8444-444444444444" },
        {
          ...seat("queued"),
          id: "55555555-5555-4555-8555-555555555555",
          position: "WAITING" as const,
        },
      ]
    : [];
  const table: PlannedTableResponse = {
    ...plannedTable,
    maxPlayers: full ? 2 : 4,
    seatedCount: full ? 2 : 0,
    waitingCount: full ? 1 : 0,
  };
  const fetcher = vi.fn(async (url: string) =>
    Response.json(
      url.includes("/groups/")
        ? group
        : url.includes("/seats?")
          ? { items: url.includes("pending=true") ? [] : rows, nextCursor: null }
          : url.includes("/tables?")
            ? { items: [], nextCursor: null }
            : url.includes(`/tables/${tableId}`)
              ? table
              : event,
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, group, event, fetcher, wrap };
}
it.each([undefined, optionId, "different-group"])(
  "shows the separate Group card only outside its matching Group context (from=%s)",
  async (fromGroup) => {
    const s = setup();
    s.client.setQueryData(groupRecordKeys.detail(options, s.group.id), s.group);
    renderWithI18n(s.wrap(<EventDetail eventId={eventId} fromGroup={fromGroup} />));
    const details = await screen.findByRole("region", { name: "Details" });
    expect(within(details).queryByRole("link")).toBeNull();
    const section = screen.queryByRole("region", { name: "Group" });
    if (fromGroup === s.group.id) {
      expect(section).toBeNull();
      expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe(
        `/groups/${s.group.id}`,
      );
      expect(screen.getByRole("link", { name: "Edit event" }).getAttribute("href")).toContain(
        `fromGroup=${s.group.id}`,
      );
    } else {
      if (!section) throw Error("Missing separate Group section");
      expect(
        details.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const link = within(section).getByRole("link", { name: `Open group: ${s.group.name}` });
      expect(link.getAttribute("href")).toBe(`/groups/${s.group.id}`);
      expect(link.querySelector("img")?.getAttribute("src")).toBe(logo);
      expect(within(section).getByText(s.group.name)).toBeTruthy();
    }
    expect(s.fetcher.mock.calls.some(([url]) => url.includes("/groups/"))).toBe(false);
  },
);
it.each(["personal", "event"] as const)(
  "keeps the Event link only for standalone/personal Table entry (%s)",
  async (context) => {
    const s = setup();
    renderWithI18n(
      s.wrap(<EventTableOverview eventId={eventId} tableId={tableId} context={context} />),
    );
    await screen.findByRole("region", { name: "Seats list" });
    expect(Boolean(screen.queryByRole("region", { name: "Event" }))).toBe(context === "personal");
    if (context === "personal")
      expect(
        screen.getByRole("link", { name: `Open event: ${plannedEvent.name}` }).getAttribute("href"),
      ).toBe(`/events/${eventId}`);
  },
);
it.each([false, true])(
  "shows a separate explained waiting section only after primary capacity is full (full=%s)",
  async (full) => {
    const s = setup(full);
    renderWithI18n(s.wrap(<EventTableOverview eventId={eventId} tableId={tableId} />));
    const primary = await screen.findByRole("region", { name: "Seats list" });
    if (!full) {
      await waitFor(() =>
        expect(within(primary).getAllByRole("button", { name: "Free place" })).toHaveLength(4),
      );
      expect(screen.queryByRole("region", { name: "Waiting list" })).toBeNull();
      return;
    }
    const waiting = await screen.findByRole("region", { name: "Waiting list" });
    await within(waiting).findByText("queued");
    expect(within(primary).queryByText("queued")).toBeNull();
    expect(
      primary.compareDocumentPosition(waiting) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(waiting).getByRole("button", { name: "Join waiting list" })).toBeTruthy();
    fireEvent.click(within(waiting).getByRole("button", { name: "Waiting list: Field help" }));
    expect(
      await screen.findByText(/When all places are reserved, new players join the waiting list/),
    ).toBeTruthy();
  },
);
it("keeps cached group artwork visible on read failure, with explicit recovery", async () => {
  const s = setup();
  s.client.setQueryData(groupRecordKeys.detail(options, s.group.id), s.group, { updatedAt: 1 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 503 })),
  );
  renderWithI18n(s.wrap(<EventGroupLink groupId={s.group.id} name={s.group.name} />));
  expect(screen.getByRole("link").querySelector("img")?.getAttribute("src")).toBe(logo);
  await screen.findByText("Could not load group");
  expect(screen.getByRole("link").querySelector("img")?.getAttribute("src")).toBe(logo);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(s.group)),
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByText("Could not load group")).toBeNull());
});
it("keeps known event-provided group name while missing artwork loads; no invented fallback photo", async () => {
  const s = setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  renderWithI18n(s.wrap(<EventGroupLink groupId={s.group.id} name={s.group.name} />));
  expect(
    screen.getByRole("link", { name: `Open group: ${s.group.name}` }).querySelector("img"),
  ).toBeNull();
  expect(screen.getByText(s.group.name)).toBeTruthy();
  expect(document.querySelector(".skeleton")).toBeTruthy();
});
it("passes origin only on contextual Event/Table links; main feeds and direct entry remain unchanged", () => {
  const s = setup();
  const view = renderWithI18n(<EventCard event={s.event} context="group" />);
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    `/events/${eventId}?fromGroup=${s.group.id}`,
  );
  view.rerender(<EventCard event={s.event} />);
  expect(screen.getByRole("link").getAttribute("href")).toBe(`/events/${eventId}`);
  view.rerender(s.wrap(<EventTableCard table={plannedTable} context="event" />));
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    `/events/${eventId}/tables/${tableId}?fromEvent=${eventId}`,
  );
  view.rerender(s.wrap(<EventTableCard table={plannedTable} />));
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    `/events/${eventId}/tables/${tableId}`,
  );
});
