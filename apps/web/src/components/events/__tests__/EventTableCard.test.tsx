import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableCard } from "../EventTableCard";

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
it("separates explicit invitation acceptance/decline from reservations and navigation", () => {
  const registration = { ...seat("owner"), status: "PENDING" as const },
    q = renderWithI18n(
      <EventTableCard
        table={{
          ...plannedTable,
          canRespond: true,
          myRegistration: registration,
          myPosition: "SEATED",
        }}
      />,
    );
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  expect(m.respond.mutate).toHaveBeenLastCalledWith({
    registrationId: registration.id,
    input: { action: "accept", version: 1 },
  });
  fireEvent.click(screen.getByRole("button", { name: "Decline invitation" }));
  expect(m.respond.mutate).toHaveBeenLastCalledWith({
    registrationId: registration.id,
    input: { action: "decline", version: 1 },
  });
  expect(screen.getByText("Reserved place")).not.toBeNull();
  expect(screen.getByText("Invitation received")).not.toBeNull();
  m.busy = true;
  q.rerender(
    <EventTableCard table={{ ...plannedTable, canRespond: true, myRegistration: registration }} />,
  );
  expect(
    (screen.getByRole("button", { name: "Accept invitation" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it("shows frozen selected games/all joint winners, excluded tables and waiting positions truthfully", () => {
  const q = renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        eventStatus: "CONFIRMED",
        confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
        myPosition: "FROZEN",
        gamesDetail: [
          ...plannedTable.gamesDetail,
          { id: 2, name: "Other game", year: null, imageUrl: null },
        ],
        winners: [
          { userId: "owner", name: "Owner", avatarUrl: null },
          { userId: "guest", name: "Guest", avatarUrl: null },
        ],
      }}
    />,
  );
  expect(screen.getByText("Confirmed player")).not.toBeNull();
  expect(screen.getByText("Winners: Owner, Guest")).not.toBeNull();
  expect(screen.queryByText("Other game")).toBeNull();
  q.rerender(
    <EventTableCard
      table={{
        ...plannedTable,
        eventStatus: "CONFIRMED",
        myPosition: "WAITING",
        canRespond: true,
        myRegistration: null,
      }}
    />,
  );
  expect(screen.getByText(/Excluded from confirmation/)).not.toBeNull();
  expect(screen.getByText("Waiting list")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  q.rerender(
    <EventTableCard table={{ ...plannedTable, eventStatus: "TERMINATED", winners: [] }} />,
  );
  expect(screen.getByText(/Terminated/)).not.toBeNull();
});
it("hides stale public invitation controls after the exact cutoff", () => {
  renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        groupType: "PUBLIC",
        bookingClosesAt: "2000-01-01T00:00:00Z",
        canRespond: true,
        myRegistration: seat("owner"),
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(screen.queryByText("Invitation received")).toBeNull();
});
