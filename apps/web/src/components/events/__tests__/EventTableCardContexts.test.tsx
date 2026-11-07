import { Avatar, Style } from "@dicebear/core";
import planets from "@dicebear/styles/planets.json" with { type: "json" };
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { groupRecord, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableCard } from "../EventTableCard";
import { EventTableInvitationActions } from "../EventTableInvitationActions";
import { TableListHeading } from "../TableListHeading";

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
it("uses exactly the same card/controls in both lists, changing only the inline parent context", () => {
  const table = {
    ...plannedTable,
    groupId: groupRecord.id,
    groupName: groupRecord.name,
    acceptedCount: 7,
    waitingCount: 3,
    pendingRegistrationCount: 2,
  };
  const q = renderWithI18n(
    <>
      <TableListHeading />
      <EventTableCard table={table} context="personal" />
    </>,
  );
  const artwork = document.querySelector("img")?.getAttribute("src");
  expect(artwork).toBe(
    `data:image/svg+xml,${encodeURIComponent(new Avatar(new Style(planets), { seed: table.id, size: 72 }).toString())}`,
  );
  const event = screen.getByText(`Event: ${table.eventName}`),
    group = screen.getByText(`Group: ${groupRecord.name}`);
  expect(event.parentElement?.parentElement).toBe(group.parentElement?.parentElement);
  expect(event.parentElement?.nextElementSibling).toBe(group.parentElement);
  expect(event.parentElement?.nextElementSibling?.textContent).toBe(`Group: ${groupRecord.name}`);
  expect(screen.getByText("First table").className).toContain("font-semibold");
  expect(screen.getByText("First table").parentElement?.nextElementSibling).toBe(
    screen.getByRole("img", { name: "Rating enabled" }),
  );
  q.rerender(
    <>
      <TableListHeading />
      <EventTableCard table={table} context="event" />
    </>,
  );
  expect(screen.queryByText(`Event: ${table.eventName}`)).toBeNull();
  expect(screen.queryByText(`Group: ${groupRecord.name}`)).toBeNull();
  expect(document.querySelector("img")?.getAttribute("src")).toBe(artwork);
  const link = screen.getByRole("link", { name: "Open table: First table" });
  expect(link.getAttribute("href")).toContain(`/tables/${table.id}`);
  const labels = [
    "Minimum players:",
    "Maximum players:",
    "Accepted players:",
    "Waiting list:",
    "Pending players:",
  ];
  expect(labels.map((label) => screen.getByText(label).parentElement?.textContent)).toEqual([
    "Minimum players: 2",
    "Maximum players: 4",
    "Accepted players: 7",
    "Waiting list: 3",
    "Pending players: 2",
  ]);
  const help = screen.getByRole("button", { name: "Table legend" });
  expect(link.contains(help)).toBe(false);
  expect(help.closest(".card")).toBeNull();
  expect(screen.getByRole("heading", { name: "Table list" })).not.toBeNull();
  fireEvent.click(help);
  expect(screen.getByText("Accepted players, including the waiting list.")).not.toBeNull();
  expect(
    screen.getByText("Pending players, including reserved waiting-list places."),
  ).not.toBeNull();
});
it.each(["personal", "event"] as const)(
  "keeps every own status below the artwork in a separate centered action in %s context",
  (context) => {
    const base = { ...plannedTable, myRegistration: seat("owner"), myPosition: "SEATED" as const };
    const q = renderWithI18n(<EventTableCard table={base} context={context} />);
    const check = (label: string, icon: string, color: string) => {
      const badge = screen.getByRole("button", { name: label });
      expect(badge.parentElement?.className).toContain("flex-wrap");
      expect(badge.parentElement?.className).not.toContain("absolute");
      expect(
        badge.parentElement?.contains(screen.getByRole("button", { name: /^Board games:/ })),
      ).toBe(true);
      expect(badge.className).toContain(color);
      expect(badge.querySelector(`svg.lucide-${icon}`)).not.toBeNull();
      expect(screen.getByRole("link").contains(badge)).toBe(false);
      expect(screen.queryByText(label)).toBeNull();
    };
    check("Confirmed player", "user-round-check", "text-success");
    q.rerender(
      <EventTableCard
        context={context}
        table={{
          ...base,
          myRegistration: { ...seat("owner"), status: "PENDING", kind: "SELF" },
          myPosition: "WAITING",
        }}
      />,
    );
    check("Participation requested", "clock-3", "text-warning");
    q.rerender(
      <EventTableCard
        context={context}
        table={{
          ...base,
          myRegistration: { ...seat("owner"), status: "PENDING", kind: "INVITATION" },
        }}
      />,
    );
    check("Invitation received", "mail", "text-warning");
    q.rerender(<EventTableCard context={context} table={{ ...base, myPosition: "WAITING" }} />);
    check("Waiting list", "list-ordered", "text-warning");
  },
);
it.each([1, 2])(
  "shows only first game plus localized additional %s-game count in Event context",
  (count) => {
    const extra = Array.from({ length: count }, (_, n) => ({
      ...plannedTable.gamesDetail[0],
      id: n + 2,
      name: `Other game ${n}`,
    }));
    renderWithI18n(
      <EventTableCard
        context="event"
        table={{ ...plannedTable, gamesDetail: [...plannedTable.gamesDetail, ...extra] }}
      />,
    );
    expect(screen.getByText(/Chess/).textContent).toBe(
      `Chess · +${count} ${count === 1 ? "game" : "games"}`,
    );
    expect(screen.getByText(`+${count} ${count === 1 ? "game" : "games"}`).className).toContain(
      "text-accent-soft-foreground",
    );
    expect(screen.queryByText("Other game 0")).toBeNull();
  },
);
it("retains selected game, all joint winner names and disabled Rating without a body status label", () => {
  renderWithI18n(
    <EventTableCard
      context="event"
      table={{
        ...plannedTable,
        eventStatus: "TERMINATED",
        rankingEnabled: false,
        gamesDetail: [
          ...plannedTable.gamesDetail,
          { ...plannedTable.gamesDetail[0], id: 2, name: "Selected game" },
        ],
        confirmed: { gameId: 2, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
        myPosition: "FROZEN",
        winners: [
          { userId: "owner", name: "Owner", avatarUrl: null },
          { userId: "guest", name: "Guest", avatarUrl: null },
        ],
      }}
    />,
  );
  expect(screen.getByText("Selected game")).not.toBeNull();
  expect(screen.queryByText(/Chess/)).toBeNull();
  expect(screen.getByRole("img", { name: "Rating disabled" })).not.toBeNull();
  expect(
    screen.getByText("Owner, Guest").parentElement?.querySelector("svg.lucide-trophy"),
  ).not.toBeNull();
  expect(screen.getByRole("button", { name: "Confirmed player" })).not.toBeNull();
  expect(screen.queryByText("Confirmed player")).toBeNull();
});
it.each(["CONFIRMED", "TERMINATED"] as const)(
  "retains excluded %s Tables in Event detail without reviving cutoff consent",
  (eventStatus) => {
    renderWithI18n(
      <EventTableCard
        context="event"
        table={{
          ...plannedTable,
          eventStatus,
          groupType: "PUBLIC",
          bookingClosesAt: "2000-01-01T00:00:00Z",
          canRespond: true,
          myRegistration: { ...seat("owner"), status: "PENDING" },
        }}
      />,
    );
    expect(screen.getByText("Excluded from confirmation")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  },
);
it("keeps external Event-context cards navigation-only and retains versioned, guarded detail consent", () => {
  const registration = { ...seat("owner", 3), status: "PENDING" as const },
    table = { ...plannedTable, canRespond: true, myRegistration: registration };
  const q = renderWithI18n(<EventTableCard context="event" table={table} />);
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline invitation" })).toBeNull();
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
    input: { action: "decline", version: 3 },
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
});
it("shows demonstrator identity or partial loading without inventing missing profiles", () => {
  const q = renderWithI18n(
    <EventTableCard
      table={{ ...plannedTable, demonstratorUserId: "demo", demonstratorName: "Demonstrator Name" }}
    />,
  );
  expect(
    screen.getByText("Demonstrator Name").parentElement?.querySelector("svg.lucide-presentation"),
  ).not.toBeNull();
  q.rerender(
    <EventTableCard
      table={{ ...plannedTable, demonstratorUserId: "demo", demonstratorName: undefined }}
    />,
  );
  expect(
    document.querySelector("svg.lucide-presentation")?.parentElement?.querySelector(".skeleton"),
  ).not.toBeNull();
  q.rerender(
    <EventTableCard
      table={{ ...plannedTable, demonstratorUserId: "demo", demonstratorName: null }}
    />,
  );
  expect(screen.getByText("Unknown")).not.toBeNull();
});
