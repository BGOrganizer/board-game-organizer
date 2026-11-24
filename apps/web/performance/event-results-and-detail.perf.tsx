import { tableLeaderboardQuery } from "@board-game-organizer/shared";
import { useQueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, vi } from "vitest";
import { EventDetailsCard } from "@/components/events/EventDetailsCard";
import { EventPlayerCard } from "@/components/events/EventPlayerCard";
import { EventResultTableCard } from "@/components/events/EventResultTableCard";
import { EventTableInfo } from "@/components/events/EventTableInfo";
import { EventTableResults } from "@/components/events/EventTableResults";
import { EventTableScheduleCard } from "@/components/events/EventTableScheduleCard";
import { GroupDetailsCard } from "@/components/groups/GroupDetailsCard";
import { groupRecord, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { measureWebFeature } from "./featureScenario";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://render-results.test",
    userId: "owner",
    getToken: async () => "fixture-result-token",
  }),
}));

const table = {
  ...plannedTable,
  groupId: groupRecord.id,
  groupType: "PUBLIC" as const,
  eventStatus: "CONFIRMED" as const,
  confirmed: {
    gameId: 1,
    startsAt: "2030-06-03T18:00:00Z",
    endsAt: "2030-06-03T19:00:00Z",
    playerIds: ["owner", "friend", "nd"],
  },
  demonstratorUserId: "demo",
  demonstratorName: "Game guide",
};

const finalTable = {
  ...table,
  eventStatus: "TERMINATED" as const,
  results: {
    entries: [
      { userId: "owner", score: "1.50", rank: 1 },
      { userId: "friend", score: "1.50", rank: 1 },
      { userId: "nd", score: null, rank: null },
    ],
    lowerWins: false,
    tieBreaks: [],
    finalizedAt: plannedTable.createdAt,
  },
  resultProfiles: [
    { userId: "owner", name: "Winner name", username: "winner", email: null, avatarUrl: null },
    { userId: "friend", name: "Other winner", username: "tied", email: null, avatarUrl: null },
    { userId: "nd", name: "ND player", email: null, avatarUrl: null },
  ],
  ratingChanges: [{ userId: "owner", score: 505, delta: 5, provisional: false }],
  groupRatingChanges: [{ userId: "owner", score: 497, delta: -3, provisional: false }],
};

measureWebFeature(
  "EventTableResults: expand immutable global and group rating history",
  <EventTableResults table={finalTable} />,
  () => {
    expect(screen.getByText("@winner")).toBeVisible();
    expect(screen.queryByText("Winner name")).toBeNull();
    expect(screen.getAllByRole("img", { name: "Position: #1" })).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Position: ND" })).toBeVisible();
    const trigger = screen.getByRole("button", { name: /Rating details.*@winner/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("505")).toBeVisible();
    expect(screen.getByText("497")).toBeVisible();
    expect(screen.getByText("+5")).toBeVisible();
    expect(screen.getByText("-3")).toBeVisible();
    fireEvent.click(trigger);
    expect(screen.queryByText("505")).toBeNull();
  },
);

function ResultReadiness() {
  const [ready, setReady] = useState(false);
  return (
    <EventResultTableCard table={table} ready={ready} busy={false} onPress={() => setReady(true)} />
  );
}

measureWebFeature(
  "EventResultTableCard: update the completion badge after editing the frozen roster",
  <ResultReadiness />,
  () => {
    const open = screen.getByRole("button", { name: "Edit scores: Chess" });
    expect(screen.getByText("Players:").parentElement).toHaveTextContent("Players: 3");
    expect(screen.queryByRole("img", { name: "Scores ready" })).toBeNull();
    fireEvent.click(open);
    expect(screen.getByRole("img", { name: "Scores ready" })).toBeVisible();
    expect(open).toHaveAccessibleDescription("Scores ready");
  },
);

measureWebFeature(
  "EventTableScheduleCard: frozen public schedule and assigned demonstrator",
  <EventTableScheduleCard table={table} timeZone="Asia/Tokyo" />,
  () => {
    const card = within(screen.getByRole("region", { name: "Table schedule" }));
    expect(card.getByText("June 4, 2030")).toBeVisible();
    const clock = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    }).format(new Date(table.confirmed.startsAt));
    expect(card.getByText(clock)).toBeVisible();
    expect(card.getByText("Game guide")).toBeVisible();
    expect(card.getByText("Demonstrator")).toBeVisible();
  },
);

measureWebFeature(
  "EventDetailsCard: disclose cumulative manager and participant roles",
  <EventDetailsCard
    event={{
      ...plannedEvent,
      canManage: true,
      managementRole: "moderator",
      myDemonstrator: true,
      myRegistrations: [{ ...seat("owner"), position: "WAITING" }],
    }}
  />,
  async () => {
    expect(screen.getByRole("heading", { name: plannedEvent.name })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
    expect(await screen.findByText("Moderator")).toBeVisible();
    expect(screen.getByText("Participant on the waiting list")).toBeVisible();
    expect(screen.getByText("Demonstrator")).toBeVisible();
  },
);

measureWebFeature(
  "EventTableInfo: disclose player constraints and keep the detail title",
  <EventTableInfo table={plannedTable} />,
  async () => {
    expect(screen.getByRole("heading", { name: "Table #1" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Planning" }));
    const help = within(await screen.findByRole("dialog"));
    expect(help.getByText("Minimum players")).toBeVisible();
    expect(help.getByText("Maximum players")).toBeVisible();
  },
);

measureWebFeature(
  "GroupDetailsCard: show the rejected public group's verified location and reason",
  <GroupDetailsCard
    group={{
      ...groupRecord,
      type: "PUBLIC",
      location: plannedEvent.locations[0],
      reviewStatus: "REJECTED",
      rejectionReason: "Please verify the venue",
      canViewEvents: false,
      eventCount: null,
    }}
  />,
  () => {
    expect(screen.getByText("Changes rejected")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Please verify the venue");
    expect(screen.getByText(plannedEvent.locations[0].name)).toBeVisible();
    expect(screen.queryByText("Events")).toBeNull();
  },
);

function PlayerIdentity() {
  const [ready, setReady] = useState(false);
  return (
    <>
      <EventPlayerCard
        name={ready ? "Ada Player" : undefined}
        username={ready ? "ada" : undefined}
        avatarUrl={null}
      >
        <p>Rated table participant</p>
      </EventPlayerCard>
      <button type="button" onClick={() => setReady(true)}>
        Resolve player identity
      </button>
    </>
  );
}
measureWebFeature(
  "EventPlayerCard: reveal identity when the player projection resolves",
  <PlayerIdentity />,
  () => {
    expect(screen.queryByText("@ada")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resolve player identity" }));
    expect(screen.getByText("@ada")).toBeVisible();
    expect(screen.getByText("Ada Player")).toBeVisible();
    expect(screen.getByText("Rated table participant")).toBeVisible();
  },
);

const currentPlayers = Array.from({ length: 12 }, (_, index) => `player-${index + 1}`);
const currentTable = { ...table, confirmed: { ...table.confirmed, playerIds: currentPlayers } };

const currentPage = {
  gameId: 1,
  scope: "GLOBAL" as const,
  nextCursor: null,
  items: currentPlayers.map((userId) => ({
    userId,
    name: userId,
    username: userId,
    avatarUrl: null,
    score: 500,
    provisional: false,
    gamesPlayed: 1,
    gamesWon: 1,
    nd: 0,
  })),
};
afterEach(() => vi.unstubAllGlobals());

function CurrentRoster() {
  const client = useQueryClient();
  useState(() => {
    const owner = {
      apiUrl: "https://render-results.test",
      userId: "owner",
      getToken: async () => null,
    };
    client.setQueryData(
      tableLeaderboardQuery(owner, currentTable.eventId, currentTable.id, 1, currentPlayers)
        .queryKey,
      { pages: [currentPage], pageParams: [""] },
    );
  });
  return <EventTableResults table={currentTable} />;
}

measureWebFeature(
  "Confirmed table results: disclose the next bounded cached player rows",
  <CurrentRoster />,
  async () => {
    expect(screen.getByText("@player-8")).toBeVisible();
    expect(screen.queryByText("@player-9")).toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getByText("@player-12")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  },
  () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        expect(url.origin).toBe("https://render-results.test");
        expect(url.pathname).toBe(
          `/api/events/${currentTable.eventId}/tables/${currentTable.id}/leaderboard`,
        );
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-result-token");
        return Response.json(currentPage);
      }),
    );
  },
);
