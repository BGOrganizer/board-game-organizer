import { createResourceArtwork } from "@board-game-organizer/shared/artwork";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
async function closePopover() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

it("uses the same normal-flow horizontal artwork, identity and controls in both lists; only Back context changes", async () => {
  const table = {
    ...plannedTable,
    groupId: groupRecord.id,
    groupName: groupRecord.name,
    seatedCount: 2,
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
    `data:image/svg+xml,${encodeURIComponent(createResourceArtwork("tables", table.id).svg)}`,
  );
  const inspect = () => {
    const event = screen.getByText(table.eventName),
      group = screen.getByText(groupRecord.name);
    expect(group.compareDocumentPosition(event) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.parentElement?.nextElementSibling?.textContent).toBe("·");
    expect(screen.getByText("2/4 participants")).not.toBeNull();
    const image = document.querySelector("img");
    for (const token of ["h-full", "w-full", "rounded-xl", "object-contain"])
      expect(image?.classList.contains(token)).toBe(true);
    expect(image?.closest(".size-24")?.className).toContain("relative");
    expect(
      screen.getByRole("button", { name: "Rating enabled" }).parentElement?.className,
    ).toContain("justify-end");
  };
  inspect();
  expect(screen.getByRole("link").getAttribute("href")).not.toContain("fromEvent");
  q.rerender(
    <>
      <TableListHeading />
      <EventTableCard table={table} context="event" />
    </>,
  );
  inspect();
  expect(document.querySelector("img")?.getAttribute("src")).toBe(artwork);
  expect(screen.getByRole("link").getAttribute("href")).toContain(`?fromEvent=${table.eventId}`);
  const help = screen.getByRole("button", { name: "Table legend" });
  expect(help.closest(".card")).toBeNull();
  fireEvent.click(help);
  expect(await screen.findByText("Accepted players, including the waiting list.")).not.toBeNull();
  expect(
    screen.getByText("Pending players, including reserved waiting-list places."),
  ).not.toBeNull();
});
it.each(["personal", "event"] as const)(
  "keeps one neutral role disclosure outside navigation in %s",
  async (context) => {
    const table = { ...plannedTable, myRegistration: seat("owner"), myPosition: "SEATED" as const };
    const view = renderWithI18n(<EventTableCard table={table} context={context} />);
    const trigger = screen.getByRole("button", { name: "Roles and participation" });
    expect(trigger.parentElement?.className).toContain("justify-end");
    expect(trigger.className).toContain("text-muted");
    expect(trigger.querySelector("svg.lucide-id-card")).not.toBeNull();
    expect(trigger.querySelector(".size-7.bg-default")).not.toBeNull();
    expect(screen.getByRole("link").contains(trigger)).toBe(false);
    fireEvent.click(trigger);
    expect(await screen.findByText("Confirmed player")).not.toBeNull();
    await closePopover();
    view.rerender(
      <EventTableCard
        table={{
          ...table,
          myRegistration: { ...seat("owner"), status: "PENDING", kind: "SELF" },
          myPosition: "WAITING",
        }}
        context={context}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
    expect(await screen.findByText("Player on the waiting list")).not.toBeNull();
    expect(screen.queryByText("Player with pending invitation")).toBeNull();
    await closePopover();
    view.rerender(
      <EventTableCard
        table={{
          ...table,
          myRegistration: { ...seat("owner"), status: "PENDING", kind: "INVITATION" },
        }}
        context={context}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
    expect(await screen.findByText("Player with pending invitation")).not.toBeNull();
  },
);
it.each([1, 2])(
  "keeps all %s additional canonical games inside the read-only popover",
  async (count) => {
    const extra = Array.from({ length: count }, (_, n) => ({
      ...plannedTable.gamesDetail[0],
      id: n + 2,
      name: `Other game ${n}`,
    }));
    renderWithI18n(
      <EventTableCard
        context="event"
        table={{
          ...plannedTable,
          eventStatus: "CONFIRMED",
          confirmed: { gameId: 1, playerIds: [], startsAt: "2030-06-03T18:00:00Z" },
          gamesDetail: [...plannedTable.gamesDetail, ...extra],
        }}
      />,
    );
    expect(screen.queryByText("Chess")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
    expect(await screen.findByText("Chess")).not.toBeNull();
    for (const row of extra) expect(screen.queryByText(row.name)).toBeNull();
  },
);
it("retains selected game, joint winners and disabled Rating in their informational controls", async () => {
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
        cardSummary: {
          tableId: plannedTable.id,
          name: plannedTable.name,
          confirmed: true,
          ready: false,
          blockers: [],
          myParticipation: "CONFIRMED",
          exclusionReasons: [],
          winners: [
            { userId: "owner", username: "owner" },
            { userId: "guest", username: "guest" },
          ],
        },
        winners: [
          { userId: "owner", name: "Owner", avatarUrl: null },
          { userId: "guest", name: "Guest", avatarUrl: null },
        ],
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Roles and participation" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
  expect(await screen.findByText("Selected game")).not.toBeNull();
  expect(screen.queryByText("Chess")).toBeNull();
  await closePopover();
  fireEvent.click(screen.getByRole("button", { name: "Terminated" }));
  const winners = await screen.findByText("@owner, @guest");
  expect(winners.querySelector("svg.lucide-trophy")?.getAttribute("class")).toContain(
    "text-warning-soft-foreground",
  );
  await closePopover();
  fireEvent.click(screen.getByRole("button", { name: "Rating disabled" }));
  expect(await screen.findByText("This table does not update player ratings.")).not.toBeNull();
});
it.each(["CONFIRMED", "TERMINATED"] as const)(
  "retains excluded %s Tables without reviving consent or unchosen games",
  async (eventStatus) => {
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
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Table excluded" }));
    expect(await screen.findByText("The table was excluded from confirmation.")).not.toBeNull();
    await closePopover();
    expect(screen.queryByRole("button", { name: "Board games: First table" })).toBeNull();
    expect(screen.queryByText("Chess")).toBeNull();
  },
);
it("keeps external cards navigation-only and detail consent versioned and guarded", () => {
  const registration = { ...seat("owner", 3), status: "PENDING" as const };
  const q = renderWithI18n(
    <EventTableCard
      context="event"
      table={{ ...plannedTable, canRespond: true, myRegistration: registration }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline invitation" })).toBeNull();
  q.rerender(
    <EventTableInvitationActions eventId={plannedTable.eventId} registration={registration} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  expect(m.respond.mutate).not.toHaveBeenCalled();
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
it.each(["Demonstrator Name", null, undefined])(
  "retains demonstrator metadata %s or explicit loading inside status help",
  async (demonstratorName) => {
    renderWithI18n(
      <EventTableCard table={{ ...plannedTable, demonstratorUserId: "demo", demonstratorName }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Planning" }));
    const dialog = await screen.findByRole("dialog");
    if (demonstratorName === undefined) expect(dialog.querySelector(".skeleton")).not.toBeNull();
    else expect(dialog.textContent).toContain(demonstratorName ?? "Unknown");
    expect(screen.queryByRole("button", { name: "Demonstrator" })).toBeNull();
  },
);
