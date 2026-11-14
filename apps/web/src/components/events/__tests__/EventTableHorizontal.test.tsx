import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableCard } from "../EventTableCard";
import { EventTableSchedulePopover } from "../EventTableSchedulePopover";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));
afterEach(() => vi.unstubAllGlobals());
async function close() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
const a = plannedEvent.locations[0],
  b = { ...a, id: "second", name: "Other venue", address: "Via Milano 2", timeZone: undefined };
const schedule = {
  ...plannedTable.eventSchedule!,
  timeZone: "Europe/Rome",
  dateCount: 2,
  locationCount: 2,
  dates: [
    { id: "one", localStartsAt: "2030-06-03T20:00" },
    { id: "two", localStartsAt: "2030-06-04T21:00" },
  ],
  locations: [a, b],
};

it("shows admin, demonstrator, pending and queue icons together, with smaller frames and no mutation/navigation", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        canManage: true,
        managementRole: "admin",
        demonstratorUserId: "owner",
        demonstratorName: "Current player",
        myRegistration: { ...seat("owner"), kind: "SELF", status: "PENDING" },
        myPosition: "WAITING",
        seatedCount: 2,
        acceptedCount: 8,
        pendingCount: 2,
        waitingCount: 7,
        eventSchedule: schedule,
      }}
    />,
  );
  expect(screen.getByText("2/4 participants")).not.toBeNull();
  expect(document.querySelector("img")?.parentElement?.className).not.toContain("bg-accent/10");
  expect(screen.queryByText("8/4 participants")).toBeNull();
  const labels = [
    "Demonstrator",
    "Player on the waiting list",
    "Planning",
    "Rating enabled",
    "Dates and times: First table",
    "Locations: First table",
    "Board games: First table",
  ];
  const nav = vi.fn();
  screen.getByRole("link").addEventListener("click", nav);
  for (const label of labels) {
    const button = screen.getByRole("button", { name: label });
    expect(button.closest("a")).toBeNull();
    expect(button.className).toContain("min-h-11 min-w-11");
    expect(button.querySelector(".size-7.bg-default")).not.toBeNull();
    expect(button.querySelector("svg.size-4")).not.toBeNull();
  }
  for (const name of [
    "Admin",
    "Administrator",
    "Moderator",
    "Management",
    "Player with pending invitation",
  ])
    expect(screen.queryByRole("button", { name })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Demonstrator" }));
  expect(await screen.findByRole("dialog")).not.toBeNull();
  await close();
  expect(nav).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
});
it.each(["moderator", undefined] as const)(
  "never invents an administrator from management capability alone (%s)",
  (managementRole) => {
    renderWithI18n(
      <EventTableCard
        table={{
          ...plannedTable,
          canManage: true,
          managementRole,
          myRegistration: seat("owner"),
          myPosition: null,
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Moderator" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Management" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Administrator" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
    expect(screen.getByLabelText("Loading…")).not.toBeNull();
  },
);
it("ignores stale managementRole when authoritative capability denies management", () => {
  renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        canManage: false,
        managementRole: "admin",
        myRegistration: null,
        demonstratorUserId: "other",
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Administrator" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Management" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Demonstrator" })).toBeNull();
});
it.each(["dates", "locations"] as const)(
  "shows all approved %s, never fetches, votes or navigates",
  async (kind) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderWithI18n(
      <EventTableSchedulePopover
        kind={kind}
        table={{ ...plannedTable, eventSchedule: schedule }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    const dialog = await screen.findByRole("dialog");
    if (kind === "dates") {
      expect(dialog.querySelectorAll("li")).toHaveLength(2);
      expect(dialog.querySelector('time[datetime="2030-06-04T21:00Z"]')).not.toBeNull();
    } else {
      expect(within(dialog).getByText(a.address)).not.toBeNull();
      expect(within(dialog).getByText(b.address)).not.toBeNull();
      for (const address of [a.address, b.address]) {
        const row = within(dialog).getByText(address).closest("li");
        expect(row?.querySelector("svg.lucide-map-pin.text-muted")).not.toBeNull();
      }
      expect(within(dialog).queryByText(a.name)).toBeNull();
      expect(within(dialog).queryByText(b.name)).toBeNull();
      expect(within(dialog).queryByText("Europe/Rome")).toBeNull();
    }
    expect(within(dialog).queryByRole("button")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it.each(["CONFIRMED", "TERMINATED"] as const)(
  "shows only actual Table start, chosen venue and chosen game for %s",
  async (eventStatus) => {
    const start = "2030-06-04T22:30:00Z";
    renderWithI18n(
      <EventTableCard
        table={{
          ...plannedTable,
          eventStatus,
          confirmed: { gameId: 2, startsAt: start, playerIds: ["owner"] },
          eventSchedule: { ...schedule, location: b, locations: [b], locationCount: 1 },
          gamesDetail: [
            ...plannedTable.gamesDetail,
            { ...plannedTable.gamesDetail[0], id: 2, name: "Selected game" },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dates and times: First table" }));
    let dialog = await screen.findByRole("dialog");
    expect(dialog.querySelectorAll("li")).toHaveLength(1);
    expect(dialog.querySelector(`time[datetime="${start}"]`)).not.toBeNull();
    expect(dialog.querySelector('time[datetime="2030-06-03T20:00Z"]')).toBeNull();
    await close();
    fireEvent.click(screen.getByRole("button", { name: "Locations: First table" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(b.address)).not.toBeNull();
    expect(within(dialog).queryByText(a.address)).toBeNull();
    expect(within(dialog).queryByText(b.name)).toBeNull();
    await close();
    fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
    expect(await screen.findByText("Selected game")).not.toBeNull();
    expect(screen.queryByText("Chess")).toBeNull();
  },
);
it.each(["dates", "locations"] as const)(
  "keeps missing %s cache projections as loading, not an empty success or guessed option",
  async (kind) => {
    renderWithI18n(
      <EventTableSchedulePopover
        kind={kind}
        table={{ ...plannedTable, eventSchedule: undefined }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    await screen.findByRole("dialog");
    expect(screen.getByLabelText("Loading…")).not.toBeNull();
    expect(screen.queryByText(/No (date|location) selected/)).toBeNull();
  },
);
it.each(["dates", "locations"] as const)(
  "handles known empty %s without resurrecting planning options",
  async (kind) => {
    renderWithI18n(
      <EventTableSchedulePopover
        kind={kind}
        table={{
          ...plannedTable,
          eventStatus: "CONFIRMED",
          eventSchedule: {
            ...schedule,
            dates: [],
            locations: [],
            location: null,
            locationCount: 0,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(
      await screen.findByText(kind === "dates" ? "No date selected" : "No location selected"),
    ).not.toBeNull();
  },
);
it("explains enabled rating and missing demonstrator names without inventing results", async () => {
  renderWithI18n(
    <EventTableCard
      table={{ ...plannedTable, demonstratorUserId: "demo", demonstratorName: null }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Rating enabled" }));
  expect(
    await screen.findByText(
      "This table contributes to player ratings when eligible results are finalized.",
    ),
  ).not.toBeNull();
  await close();
  fireEvent.click(screen.getByRole("button", { name: "Planning" }));
  expect(await screen.findByText(/Demonstrator: Unknown/)).not.toBeNull();
});
