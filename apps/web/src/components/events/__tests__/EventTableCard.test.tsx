import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { GroupCard } from "@/components/groups/GroupCard";
import { groupRecord, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableCard } from "../EventTableCard";
import { EventTableInvitationActions } from "../EventTableInvitationActions";

const m = vi.hoisted(() => ({
  busy: false,
  blocking: false,
  isResponding: vi.fn(() => false),
  respond: { mutate: vi.fn() },
}));
vi.mock("../EventJoinSheet", () => ({
  EventJoinSheet: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button type="button" onClick={onClose}>
        Cancel choices
      </button>
    </div>
  ),
}));
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
  m.blocking = false;
  m.isResponding.mockReturnValue(false);
  vi.clearAllMocks();
});
async function closePopover() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
it("keeps approved games in their informational popover and badges the viewer's real state", async () => {
  const gamesDetail = [
    ...plannedTable.gamesDetail,
    { id: 2, name: "Second game", year: null, imageUrl: null },
    { id: 3, name: "Third game", year: null, imageUrl: null },
  ];
  const q = renderWithI18n(
    <EventTableCard
      table={{ ...plannedTable, gamesDetail, myRegistration: seat("owner"), myPosition: "SEATED" }}
    />,
  );
  expect(screen.queryByText("Chess")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
  expect(await screen.findByText("Chess")).not.toBeNull();
  expect(screen.getByText("Second game")).not.toBeNull();
  expect(screen.getByText("Third game")).not.toBeNull();
  await closePopover();
  expect(
    screen
      .getByRole("button", { name: "Confirmed player" })
      .querySelector("svg.lucide-user-round-check"),
  ).not.toBeNull();
  q.rerender(<EventTableCard table={{ ...plannedTable, gamesDetail: gamesDetail.slice(0, 2) }} />);
  fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
  expect(await screen.findByText("Second game")).not.toBeNull();
  expect(screen.queryByText("Third game")).toBeNull();
  await closePopover();
  q.rerender(
    <EventTableCard
      table={{
        ...plannedTable,
        eventStatus: "TERMINATED",
        myRegistration: seat("owner"),
        myPosition: "FROZEN",
        winners: [
          { userId: "owner", name: "Owner", avatarUrl: null },
          { userId: "guest", name: "Guest", avatarUrl: null },
        ],
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Confirmed player" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Terminated" }));
  expect(await screen.findByText(/Owner, Guest/)).not.toBeNull();
  await closePopover();
  expect(screen.queryByText("Confirmed player")).toBeNull();
  q.rerender(<EventTableCard table={{ ...plannedTable, gamesDetail: [] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
  expect(await screen.findByText("No games found")).not.toBeNull();
});
it("keeps external cards navigation-only and preserves explicit versioned consent in detail controls", () => {
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
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline invitation" })).toBeNull();
  expect(m.respond.mutate).not.toHaveBeenCalled();
  expect(screen.queryByText("Reserved place")).toBeNull();
  expect(screen.queryByText("Invitation received")).toBeNull();
  const badge = screen.getByRole("button", {
    name: "Player with pending invitation · Reply required",
  });
  expect(badge.className).toContain("text-warning");
  expect(badge.parentElement?.className).toContain("flex-nowrap");
  expect(badge.parentElement?.className).not.toContain("absolute");
  expect(screen.getByRole("link").contains(badge)).toBe(false);
  expect(badge.querySelector("svg.lucide-mail")).not.toBeNull();
  q.rerender(
    <EventTableInvitationActions eventId={plannedTable.eventId} registration={registration} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  expect(m.respond.mutate).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel choices" }));
  fireEvent.click(screen.getByRole("button", { name: "Decline invitation" }));
  expect(m.respond.mutate).toHaveBeenLastCalledWith({
    registrationId: registration.id,
    input: { action: "decline", version: 1 },
  });
  m.busy = true;
  q.rerender(
    <EventTableInvitationActions eventId={plannedTable.eventId} registration={registration} />,
  );
  expect(
    (screen.getByRole("button", { name: "Accept invitation" }) as HTMLButtonElement).disabled,
  ).toBe(false);
  m.isResponding.mockReturnValue(true);
  q.rerender(
    <EventTableInvitationActions eventId={plannedTable.eventId} registration={registration} />,
  );
  expect(
    (screen.getByRole("button", { name: "Accept invitation" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  m.isResponding.mockReturnValue(false);
  m.blocking = true;
  q.rerender(
    <EventTableInvitationActions eventId={plannedTable.eventId} registration={registration} />,
  );
  expect(
    (screen.getByRole("button", { name: "Accept invitation" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it("shows frozen selected games/all joint winners, excluded tables and waiting positions truthfully", async () => {
  const q = renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        eventStatus: "TERMINATED",
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
  expect(screen.getByRole("button", { name: "Confirmed player" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
  expect(await screen.findByText("Chess")).not.toBeNull();
  expect(screen.queryByText("Other game")).toBeNull();
  await closePopover();
  fireEvent.click(screen.getByRole("button", { name: "Terminated" }));
  expect(await screen.findByText(/Owner, Guest/)).not.toBeNull();
  await closePopover();
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
  fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
  expect(await screen.findByText("Excluded from confirmation")).not.toBeNull();
  await closePopover();
  expect(screen.getByRole("button", { name: "Player on the waiting list" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  q.rerender(
    <EventTableCard table={{ ...plannedTable, eventStatus: "TERMINATED", winners: [] }} />,
  );
  expect(screen.queryByText("Terminated")).toBeNull();
  expect(screen.queryByText("Confirmed")).toBeNull();
});
it("shows accepted seats/capacity and Group before Event, retaining other totals in status help", async () => {
  renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        groupId: groupRecord.id,
        groupName: groupRecord.name,
        acceptedCount: 7,
        pendingRegistrationCount: 3,
        seatedCount: 1,
        pendingCount: 1,
        waitingCount: 8,
      }}
    />,
  );
  expect(screen.getByText("1/4 participant")).not.toBeNull();
  const event = screen.getByText(plannedTable.eventName);
  const group = screen.getByText(groupRecord.name);
  expect(event.parentElement?.querySelector("svg.lucide-calendar-days")).not.toBeNull();
  expect(group.parentElement?.querySelector("svg.lucide-users-round")).not.toBeNull();
  expect(group.compareDocumentPosition(event) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Planning" }));
  const dialog = await screen.findByRole("dialog");
  for (const [label, value] of [
    ["Minimum players", "2"],
    ["Maximum players", "4"],
    ["Accepted players", "7"],
    ["Waiting list", "8"],
    ["Unconfirmed players", "3"],
  ])
    expect(within(dialog).getByText(label).parentElement?.querySelector("dd")?.textContent).toBe(
      value,
    );
  await closePopover();
  expect(screen.queryByText("Reserved place")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Invitation received/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Table legend" })).toBeNull();
});
it("keeps old cached identity while missing new Group/total fields use skeletons, not guessed zeros", async () => {
  const { container } = renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        groupId: groupRecord.id,
        groupName: undefined,
        acceptedCount: undefined,
        pendingRegistrationCount: undefined,
      }}
    />,
  );
  expect(screen.getByText(plannedTable.eventName)).not.toBeNull();
  expect(container.querySelectorAll(".skeleton")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Planning" }));
  await screen.findByRole("dialog");
  expect(
    screen.getByText("Accepted players").parentElement?.querySelector(".skeleton"),
  ).not.toBeNull();
  expect(
    screen.getByText("Unconfirmed players").parentElement?.querySelector(".skeleton"),
  ).not.toBeNull();
});
it("marks a pending self request without offering self-approval, including inconsistent stale capabilities", () => {
  renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        canRespond: true,
        myRegistration: { ...seat("owner"), kind: "SELF", status: "PENDING" },
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: /Player with pending invitation/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline invitation" })).toBeNull();
});
it.each(["ACCEPTED", "DECLINED", "CANCELLED"] as const)(
  "never offers invitation responses for a %s registration",
  (status) => {
    renderWithI18n(
      <EventTableInvitationActions
        eventId={plannedTable.eventId}
        registration={{ ...seat("owner"), status }}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  },
);
it("rejects direct response controls for a pending self request", () => {
  renderWithI18n(
    <EventTableInvitationActions
      eventId={plannedTable.eventId}
      registration={{ ...seat("owner"), kind: "SELF", status: "PENDING" }}
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
});
it("offers navigation but no consent controls on Group or Table invitation cards", () => {
  renderWithI18n(
    <>
      <GroupCard
        group={{
          ...groupRecord,
          role: "invited",
          myMembership: {
            id: groupRecord.id,
            groupId: groupRecord.id,
            userId: "owner",
            kind: "INVITATION",
            status: "PENDING",
            version: 1,
            createdAt: groupRecord.createdAt,
            updatedAt: groupRecord.updatedAt,
          },
        }}
      />
      <EventTableCard
        table={{
          ...plannedTable,
          canRespond: true,
          myRegistration: { ...seat("owner"), status: "PENDING" },
        }}
      />
    </>,
  );
  expect(screen.getByRole("link", { name: `Open group: ${groupRecord.name}` })).not.toBeNull();
  expect(screen.getByRole("link", { name: `Open table: ${plannedTable.name}` })).not.toBeNull();
  expect(screen.queryByRole("button", { name: /Accept invitation/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Decline invitation/ })).toBeNull();
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
