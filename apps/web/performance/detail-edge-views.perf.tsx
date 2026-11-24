import type { TableCardSummary } from "@board-game-organizer/schemas";
import { type EventTableDraft, newTableDraft } from "@board-game-organizer/shared";
import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, vi } from "vitest";
import TablesPage from "@/app/(tabs)/tables/page";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { EventCard } from "@/components/events/EventCard";
import { EventDraftTableCard } from "@/components/events/EventDraftTableCard";
import { EventDraftTableEditor } from "@/components/events/EventDraftTableEditor";
import { EventGroupLink } from "@/components/events/EventGroupLink";
import { EventGuestBadge } from "@/components/events/EventGuestBadge";
import { GameCatalogMetadata } from "@/components/games/GameCatalogMetadata";
import { GroupMemberPicker } from "@/components/groups/GroupMemberPicker";
import { NotificationChangeDescription } from "@/components/notifications/NotificationChangeDescription";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { measureWebFeature } from "./featureScenario";

const api = {
  apiUrl: "https://detail-views-render.test",
  userId: "owner",
  getToken: async () => "fixture-detail-view-token",
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => api }));
afterEach(() => vi.unstubAllGlobals());

const tableSummaries: TableCardSummary[] = Array.from({ length: 9 }, (_, index) => ({
  tableId: `table-${index + 1}`,
  order: index,
  name: `Legacy title ${index + 1}`,
  confirmedGameName: `Selected game ${index + 1}`,
  ready: true,
  confirmed: true,
  myParticipation: "CONFIRMED",
  blockers: [],
  exclusionReasons: [],
  winners: [{ userId: `player-${index + 1}`, username: `winner-${index + 1}` }],
}));

measureWebFeature(
  "Event card history: page the frozen table winners and omit legacy titles",
  <EventCard
    event={{
      ...plannedEvent,
      status: "TERMINATED",
      cardSummary: { ready: true, tables: tableSummaries },
    }}
  />,
  async () => {
    fireEvent.click(screen.getByRole("button", { name: "Terminated" }));
    const status = within(await screen.findByRole("dialog"));
    expect(status.getByText("@winner-1")).toBeVisible();
    expect(status.getByText("Selected game 1")).toBeVisible();
    expect(status.queryByText("Legacy title 1")).toBeNull();
    expect(status.queryByText("@winner-9")).toBeNull();
    fireEvent.click(status.getByRole("button", { name: "Next page" }));
    expect(status.getByText("@winner-9")).toBeVisible();
    expect(status.queryByText("@winner-1")).toBeNull();
  },
);

measureWebFeature(
  "Event planning settings: explain the enabled assisted BGG recommendation",
  <EventCard
    event={{
      ...plannedEvent,
      playerPreference: "BEST",
      planningMode: "ASSISTED",
      allowBestReduction: true,
    }}
  />,
  async () => {
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const settings = within(await screen.findByRole("dialog"));
    expect(settings.getByText("BGG Best")).toBeVisible();
    expect(
      settings.getByText(
        "Assisted planning may seat fewer players to improve the BGG recommendation.",
      ),
    ).toBeVisible();
  },
);

function DraftTable() {
  const [row, setRow] = useState<EventTableDraft>({
    ...newTableDraft("draft"),
    demonstratorGuestName: "Guest Ada",
    startsWall: "2030-06-03T20:00",
    minPlayers: 2,
    maxPlayers: 4,
    games: [{ id: 1, name: "Chess", year: null, imageUrl: null }],
  });
  return (
    <>
      <EventDraftTableCard row={row} title="Draft #1" publicGroup />
      <EventDraftTableEditor
        row={row}
        publicGroup
        eventStartWall="2030-06-03T20:00"
        eventEndWall="2030-06-03T23:00"
        busy={false}
        onChange={(value) => setRow((old) => ({ ...old, ...value }))}
        onRemove={() => {}}
        onGame={() => {}}
        onDemonstrator={() => {}}
      />
    </>
  );
}
measureWebFeature(
  "Event draft table: retain the guest illustration and update the maximum seat count",
  <DraftTable />,
  () => {
    expect(screen.getByText("Draft #1")).toBeVisible();
    const guest = screen.getByText("Guest Ada");
    expect(guest).toBeVisible();
    const guestRow = guest.closest("li");
    if (!guestRow) throw new Error("Expected the demonstrator in an identity row");
    expect(within(guestRow).getByRole("button", { name: "Remove demonstrator" })).toBeVisible();
    const maximum = screen.getByLabelText("Maximum players");
    expect(maximum).toHaveTextContent("4");
    fireEvent.click(screen.getByRole("button", { name: "Increase Maximum players" }));
    expect(maximum).toHaveTextContent("5");
    expect(guest).toBeVisible();
  },
);

measureWebFeature(
  "Guest badge: open the voting-role explanation from the actual guest avatar row",
  <GroupedList>
    <UserListRow
      name="@guest"
      avatarUrl={null}
      avatarContent={<GuestAvatar name="guest" />}
      badge={<EventGuestBadge />}
    />
  </GroupedList>,
  async () => {
    expect(screen.getByText("@guest")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Guest" }));
    expect(
      await screen.findByText("This player is a guest. An organizer can vote on their behalf."),
    ).toBeVisible();
  },
);

measureWebFeature(
  "Event group link: enhance the summary with the authoritative record",
  <EventGroupLink groupId={groupRecord.id} name="Cached group" />,
  async () => {
    const projection = await screen.findByRole("link", { name: `Open group: ${groupRecord.name}` });
    expect(projection).toHaveAttribute("href", `/groups/${groupRecord.id}`);
    expect(screen.queryByText("Cached group")).toBeNull();
  },
  () =>
    mockGet((url) => {
      expect(url.pathname).toBe(`/api/groups/${groupRecord.id}`);
      return groupRecord;
    }),
);

const member = {
  userId: "demonstrator",
  name: "Accepted guide",
  avatarUrl: null,
  isAdmin: true,
  ban: null,
  membership: null,
};
const chooseMember = vi.fn();
measureWebFeature(
  "GroupMemberPicker: choose an authorized demonstrator through the grouped list",
  <GroupMemberPicker
    groupId={groupRecord.id}
    excludeIds={["already-assigned"]}
    onSelect={chooseMember}
  />,
  async () => {
    const control = await screen.findByRole("button", { name: "Select user: Accepted guide" });
    expect(screen.queryByRole("button", { name: "Select user: Already assigned" })).toBeNull();
    fireEvent.click(control);
    expect(chooseMember).toHaveBeenCalledExactlyOnceWith({
      id: member.userId,
      name: member.name,
      avatarUrl: null,
    });
  },
  () => {
    chooseMember.mockClear();
    mockGet((url) => {
      expect(url.pathname).toBe(`/api/groups/${groupRecord.id}/members`);
      return {
        items: [member, { ...member, userId: "already-assigned", name: "Already assigned" }],
        nextCursor: null,
      };
    });
  },
);

measureWebFeature(
  "Tables route: show the empty history and disclose the eligibility rule",
  <TablesPage />,
  async () => {
    expect(await screen.findByText("No tables found")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Table history help" }));
    expect(
      await screen.findByText(
        "Confirmed tables from finished events where you played, were a demonstrator or are still a manager.",
      ),
    ).toBeVisible();
  },
  () =>
    mockGet((url) => {
      expect(url.pathname).toBe("/api/tables");
      return { items: [], nextCursor: null };
    }),
);

measureWebFeature(
  "NotificationChangeDescription: show localized Unicode text without losing context",
  <NotificationChangeDescription
    change={{ title: "Date updated", description: "Café e società" }}
  />,
  () => {
    expect(screen.getByText("Date updated")).toBeVisible();
    expect(screen.getByText("Café e società")).toBeVisible();
  },
);

function mockGet(respond: (url: URL) => object) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(api.apiUrl);
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer fixture-detail-view-token",
      );
      return Response.json(respond(url));
    }),
  );
}

measureWebFeature(
  "GameCatalogMetadata: load visible catalog details and show the retrieved score",
  <GameCatalogMetadata
    game={{ id: 1, name: "Chess", imageUrl: null, year: null }}
    name="Chess"
    visible
  />,
  async () => {
    fireEvent.click(screen.getByRole("button", { name: "Game information: Chess" }));
    const detail = within(await screen.findByRole("dialog", { name: "Chess" }));
    expect(await detail.findByText("7.90")).toBeVisible();
    expect(detail.getByText("#23")).toBeVisible();
  },
  () =>
    mockGet((url) => {
      expect(url.pathname).toBe("/api/bgg/thing");
      expect(url.searchParams.get("ids")).toBe("1");
      return {
        items: [
          {
            id: 1,
            name: "Chess",
            imageUrl: null,
            year: 1800,
            average: 7.9,
            rank: 23,
            minPlayMinutes: 30,
            maxPlayMinutes: 60,
            categories: ["Abstract Strategy"],
          },
        ],
      };
    }),
);
