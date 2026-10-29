import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { GroupCard } from "@/components/groups/GroupCard";
import { groupRecord, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableCard } from "../EventTableCard";
import { EventTableInvitationActions } from "../EventTableInvitationActions";

const m = vi.hoisted(() => ({ busy: false, respond: { mutate: vi.fn() } }));
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
  vi.clearAllMocks();
});
it("keeps first game plus localized additional count and badges current viewer's real state", () => {
  const gamesDetail = [
    ...plannedTable.gamesDetail,
    { id: 2, name: "Second game", year: null, imageUrl: null },
    { id: 3, name: "Third game", year: null, imageUrl: null },
  ];
  const q = renderWithI18n(
    <EventTableCard table={{ ...plannedTable, gamesDetail, myRegistration: seat("owner") }} />,
  );
  expect(screen.getByText(/Chess/)).not.toBeNull();
  expect(screen.getByText(/\+2 games/)).not.toBeNull();
  expect(screen.queryByText("Second game")).toBeNull();
  expect(
    screen
      .getByRole("img", { name: "Confirmed player" })
      .querySelector("svg.lucide-user-round-check"),
  ).not.toBeNull();
  q.rerender(<EventTableCard table={{ ...plannedTable, gamesDetail: gamesDetail.slice(0, 2) }} />);
  expect(screen.getByText(/\+1 game/)).not.toBeNull();
  q.rerender(
    <EventTableCard
      table={{
        ...plannedTable,
        eventStatus: "TERMINATED",
        myRegistration: seat("owner"),
        winners: [
          { userId: "owner", name: "Owner", avatarUrl: null },
          { userId: "guest", name: "Guest", avatarUrl: null },
        ],
      }}
    />,
  );
  expect(screen.getByRole("img", { name: "Confirmed player" })).not.toBeNull();
  expect(
    screen.getByText("Owner, Guest").parentElement?.querySelector("svg.lucide-trophy"),
  ).not.toBeNull();
  expect(screen.queryByText("Confirmed player")).toBeNull();
  q.rerender(<EventTableCard table={{ ...plannedTable, gamesDetail: [] }} />);
  expect(screen.getByText("Unknown")).not.toBeNull();
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
  expect(m.respond.mutate).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel choices" }));
  fireEvent.click(screen.getByRole("button", { name: "Decline invitation" }));
  expect(m.respond.mutate).toHaveBeenLastCalledWith({
    registrationId: registration.id,
    input: { action: "decline", version: 1 },
  });
  expect(screen.queryByText("Reserved place")).toBeNull();
  expect(screen.queryByText("Invitation received")).toBeNull();
  const badge = screen.getByRole("img", { name: "Invitation received" });
  expect(badge.className).toContain("text-warning");
  expect(badge.className).toContain("bottom-0");
  expect(badge.className).toContain("right-0");
  expect(badge.parentElement?.querySelector("img")).not.toBeNull();
  expect(badge.querySelector("svg.lucide-mail")).not.toBeNull();
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
  expect(screen.getByRole("img", { name: "Confirmed player" })).not.toBeNull();
  expect(screen.getByText("Owner, Guest")).not.toBeNull();
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
  expect(screen.getByRole("img", { name: "Waiting list" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  q.rerender(
    <EventTableCard table={{ ...plannedTable, eventStatus: "TERMINATED", winners: [] }} />,
  );
  expect(screen.queryByText("Terminated")).toBeNull();
  expect(screen.queryByText("Confirmed")).toBeNull();
});
it("shows Event/Group identity and separate minimum, maximum, accepted and pending totals in one icon row", () => {
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
  const event = screen.getByText(plannedTable.eventName);
  expect(event.previousElementSibling?.classList.contains("lucide-calendar-days")).toBe(true);
  expect(event.nextElementSibling).toBeNull();
  expect(screen.queryByText("Planning")).toBeNull();
  const group = screen.getByText(groupRecord.name);
  expect(group.previousElementSibling?.classList.contains("lucide-users-round")).toBe(true);
  expect(event.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  let row: HTMLElement | null = null;
  for (const [label, icon, value] of [
    ["Minimum players", "user-round-minus", "2"],
    ["Maximum players", "user-round-plus", "4"],
    ["Accepted players", "user-round-check", "7"],
    ["Waiting list", "list-ordered", "8"],
    ["Pending players", "clock-3", "3"],
  ]) {
    const stat = screen.getByText(`${label}:`).parentElement!;
    expect(stat.querySelector(`svg.lucide-${icon}`)).not.toBeNull();
    expect(stat.textContent).toBe(`${label}: ${value}`);
    row ??= stat.parentElement;
    expect(stat.parentElement).toBe(row);
  }
  expect(row?.className).toContain("flex-nowrap");
  expect(screen.queryByText("Reserved place")).toBeNull();
  expect(screen.queryByRole("img", { name: "Invitation received" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Players: Field help" }));
  expect(screen.getByText("Accepted players, including the waiting list.")).not.toBeNull();
});
it("keeps old cached identity while missing new Group/total fields use skeletons, not guessed zeros", () => {
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
  expect(container.querySelectorAll(".skeleton")).toHaveLength(3);
  expect(
    screen.getByText("Accepted players:").parentElement?.querySelector(".skeleton"),
  ).not.toBeNull();
  expect(
    screen.getByText("Pending players:").parentElement?.querySelector(".skeleton"),
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
  const badge = screen.getByRole("img", { name: "Participation requested" });
  expect(badge.className).toContain("text-warning");
  expect(badge.querySelector("svg.lucide-clock-3")).not.toBeNull();
  expect(badge.parentElement?.querySelector("img")).not.toBeNull();
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
it("uses exactly the Group invitation button variants, dimensions and Check/X icons", () => {
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
        pending={false}
        onRespond={vi.fn()}
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
  for (const [label, icon, variant] of [
    ["Accept invitation", "check", "primary"],
    ["Decline invitation", "x", "danger-soft"],
  ]) {
    const tableButton = screen.getByRole("button", { name: label });
    const groupButton = screen.getByRole("button", { name: `${label}: ${groupRecord.name}` });
    expect(tableButton.className).toBe(groupButton.className);
    expect(tableButton.className).toContain(`button--${variant}`);
    expect(tableButton.querySelector(`svg.lucide-${icon}`)?.getAttribute("class")).toBe(
      groupButton.querySelector(`svg.lucide-${icon}`)?.getAttribute("class"),
    );
    expect(tableButton.closest("a")).toBeNull();
  }
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
