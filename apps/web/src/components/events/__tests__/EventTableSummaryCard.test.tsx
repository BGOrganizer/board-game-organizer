import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableSummaryCard } from "../EventTableSummaryCard";

const m = vi.hoisted(() => ({ busy: false, respond: { mutate: vi.fn() } }));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useEventRecordActions: () => m,
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
beforeEach(() => {
  m.busy = false;
  vi.clearAllMocks();
});

it("keeps contextual identity concise, rating explicit and the count legend outside navigation", async () => {
  renderWithI18n(
    <EventTableSummaryCard
      table={{ ...plannedTable, seatedCount: 2, waitingCount: 3, pendingCount: 1 }}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Open table: First table" }).getAttribute("href"),
  ).toContain(`/tables/${plannedTable.id}`);
  const identity = screen.getByRole("link", { name: "Open table: First table" });
  const artwork = identity.querySelector("img");
  expect(artwork).not.toBeNull();
  expect(artwork?.closest("a")).toBe(identity);
  for (const label of ["Table name", "Players", "Games", "Reserved place"])
    expect(screen.queryByText(label, { exact: true })).toBeNull();
  const name = screen.getByText("First table");
  expect(name.className).toContain("text-foreground");
  expect(name.className).not.toContain("text-accent");
  expect(name.previousElementSibling?.classList.contains("lucide-dices")).toBe(true);
  expect(name.closest(".space-y-2")).not.toBeNull();
  expect(name.className).not.toContain("min-h-11");
  expect(identity.contains(screen.getByText("2/2"))).toBe(true);
  expect(identity.contains(screen.getByText("Chess"))).toBe(true);
  expect(artwork?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
  expect(artwork?.getAttribute("alt")).toBe("");
  expect(screen.getByText("Chess").closest("p")?.querySelector("svg.lucide-dices")).not.toBeNull();
  expect(screen.queryByText(plannedTable.eventName)).toBeNull();
  expect(screen.queryByText("Planning")).toBeNull();
  const rating = screen.getByRole("img", { name: "Rating enabled" });
  expect(rating.className).toContain("chip--accent");
  expect(rating.className).toContain("chip--primary");
  expect(screen.getByText("Rating")).not.toBeNull();
  expect(screen.queryByText("Rating enabled")).toBeNull();
  expect(screen.getByText("2/2")).not.toBeNull();
  expect(screen.getByText("Maximum players:").parentElement?.textContent).toContain("4");
  expect(screen.getByText("Waiting:").parentElement?.textContent).toContain("3");
  const help = screen.getByRole("button", { name: "Players: Field help" });
  expect(help.closest("a")).toBeNull();
  fireEvent.click(help);
  expect(await screen.findByText("Seated accepted players / minimum required")).not.toBeNull();
});
it.each([1, 2])("shows first game plus localized count for %s further games", (count) => {
  const extra = Array.from({ length: count }, (_, n) => ({
    ...plannedTable.gamesDetail[0],
    id: n + 2,
    name: `Other game ${n}`,
  }));
  renderWithI18n(
    <EventTableSummaryCard
      table={{ ...plannedTable, gamesDetail: [...plannedTable.gamesDetail, ...extra] }}
    />,
  );
  expect(screen.getByText(`Chess · +${count} ${count === 1 ? "game" : "games"}`)).not.toBeNull();
  expect(screen.queryByText("Other game 0")).toBeNull();
});
it("uses only the confirmed game and retains frozen roster/winner context", () => {
  renderWithI18n(
    <EventTableSummaryCard
      table={{
        ...plannedTable,
        eventStatus: "TERMINATED",
        rankingEnabled: false,
        gamesDetail: [
          ...plannedTable.gamesDetail,
          { ...plannedTable.gamesDetail[0], id: 2, name: "Selected game" },
        ],
        confirmed: { gameId: 2, playerIds: ["owner"], startsAt: "2030-06-03T18:00:00Z" },
        myPosition: "FROZEN",
        winners: [{ userId: "owner", name: "Owner", avatarUrl: null }],
      }}
    />,
  );
  expect(screen.getByText("Selected game")).not.toBeNull();
  expect(screen.queryByText(/Chess/)).toBeNull();
  expect(screen.getByRole("img", { name: "Rating disabled" })).not.toBeNull();
  expect(screen.getByText("Rating")).not.toBeNull();
  expect(screen.getByText("Confirmed player")).not.toBeNull();
  expect(screen.getByText("Winners: Owner")).not.toBeNull();
});
it.each(["CONFIRMED", "TERMINATED"] as const)(
  "does not misrepresent excluded tables in %s events or revive cutoff invitations",
  (eventStatus) => {
    renderWithI18n(
      <EventTableSummaryCard
        table={{
          ...plannedTable,
          eventStatus,
          groupType: "PUBLIC",
          bookingClosesAt: "2000-01-01T00:00:00Z",
          canRespond: true,
          myRegistration: seat("owner"),
          myPosition: "WAITING",
        }}
      />,
    );
    expect(screen.getByText("Excluded from confirmation")).not.toBeNull();
    expect(screen.getByText("Waiting list")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  },
);
it("shows missing game metadata without fabricating a game or a plural count", () => {
  renderWithI18n(
    <EventTableSummaryCard table={{ ...plannedTable, gamesDetail: [], winners: undefined }} />,
  );
  expect(screen.getByText("Unknown")).not.toBeNull();
  expect(screen.queryByText(/\+\d+ games?/)).toBeNull();
});
it("retains explicit versioned invitation consent and prevents repeat submission while busy", () => {
  const registration = { ...seat("owner", 3), status: "PENDING" as const };
  const table = {
    ...plannedTable,
    canRespond: true,
    myRegistration: registration,
    myPosition: "SEATED" as const,
  };
  const view = renderWithI18n(<EventTableSummaryCard table={table} />);
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  expect(m.respond.mutate).toHaveBeenLastCalledWith({
    registrationId: registration.id,
    input: { action: "accept", version: 3 },
  });
  fireEvent.click(screen.getByRole("button", { name: "Decline invitation" }));
  expect(m.respond.mutate).toHaveBeenLastCalledWith({
    registrationId: registration.id,
    input: { action: "decline", version: 3 },
  });
  expect(screen.queryByText("Reserved place")).toBeNull();
  m.busy = true;
  view.rerender(<EventTableSummaryCard table={table} />);
  expect(
    (screen.getByRole("button", { name: "Accept invitation" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
