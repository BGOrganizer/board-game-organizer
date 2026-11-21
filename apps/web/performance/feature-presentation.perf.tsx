import { configure, measureRenders } from "@callstack/reassure-measure";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { test } from "vitest";
import { EventSeatListHeading } from "@/components/events/EventSeatListHeading";
import { EventTableGamesPopover } from "@/components/events/EventTableGamesPopover";
import { EventTableRatingInfo } from "@/components/events/EventTableRatingInfo";
import { EventVoteLegend } from "@/components/events/EventVoteLegend";
import { OptionVoteVoters } from "@/components/events/OptionVoteVoters";
import { GameCatalogMetadata } from "@/components/games/GameCatalogMetadata";
import { GameListCard } from "@/components/games/GameListCard";
import { GameListRow } from "@/components/games/GameListRow";
import { GroupStatusBadge } from "@/components/groups/GroupStatusBadge";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { NotificationKindIcon } from "@/components/notifications/NotificationKindIcon";
import { ProfileBggAttribution } from "@/components/profile/ProfileBggAttribution";
import { ProfileRatingChart } from "@/components/profile/ProfileRatingChart";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { ProfileVersion } from "@/components/profile/ProfileVersion";
import { GameRating } from "@/components/ratings/GameRating";
import { LeaderboardGameCover } from "@/components/ratings/LeaderboardGameCover";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

configure({ testingLibrary: { render: renderWithI18n, cleanup }, runs: 10, warmupRuns: 1 });

const games = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1,
  name: `Game ${index + 1}`,
  imageUrl: null,
  year: 2020 + index,
}));

function SelectGame() {
  const [selected, setSelected] = useState(false);
  return (
    <>
      <GameListCard
        name="Cascadia"
        game={{ id: 1, name: "Cascadia", imageUrl: null, year: 2021, average: 7.83, rank: 42 }}
        onPress={() => setSelected(true)}
      />
      {selected ? <p>Game selected</p> : null}
    </>
  );
}

function SelectLocation() {
  const [selected, setSelected] = useState(false);
  return (
    <ul>
      <LocationListRow
        name="Community centre"
        address="Via Roma 1"
        onPress={() => setSelected(true)}
      >
        {selected ? <p>Venue selected</p> : null}
      </LocationListRow>
    </ul>
  );
}

const knownGameBadge = (
  <GameCatalogMetadata
    name="Cascadia"
    visible={false}
    game={{
      id: 1,
      name: "Cascadia",
      imageUrl: null,
      year: 2021,
      average: 7.83,
      rank: 42,
      minPlayMinutes: 30,
      maxPlayMinutes: 60,
    }}
  />
);

const cases: { name: string; element: ReactElement; scenario: () => Promise<void> }[] = [
  {
    name: "GameCatalogMetadata: rating, rank and known duration",
    element: knownGameBadge,
    scenario: async () => {
      screen.getByRole("button", { name: "Game information: Cascadia" });
    },
  },
  {
    name: "GameCatalogMetadata: open BGG details",
    element: knownGameBadge,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Game information: Cascadia" }));
      await screen.findByRole("dialog", { name: "Cascadia" });
      screen.getByText("7.83");
      screen.getByText("#42");
      screen.getByText("30–60 min");
    },
  },
  {
    name: "GameListRow: display-only game with supplied metadata",
    element: (
      <ul>
        <GameListRow
          name="Ark Nova"
          game={{ id: 2, name: "Ark Nova", imageUrl: null, rank: 4, year: 2021 }}
        />
      </ul>
    ),
    scenario: async () => {
      screen.getByText("Ark Nova");
      screen.getByRole("button", { name: "Game information: Ark Nova" });
    },
  },
  {
    name: "GameListCard: choose a game using its real row action",
    element: <SelectGame />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cascadia" }));
      await screen.findByText("Game selected");
    },
  },
  {
    name: "LocationListRow: select a verified location",
    element: <SelectLocation />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Community centre" }));
      await screen.findByText("Venue selected");
    },
  },
  {
    name: "GroupStatusBadge: rejected public changes",
    element: (
      <GroupStatusBadge
        group={{ type: "PUBLIC", approved: groupRecord.approved, reviewStatus: "REJECTED" }}
      />
    ),
    scenario: async () => {
      screen.getByText("Changes rejected");
    },
  },
  {
    name: "NotificationKindIcon: completed-event glyph",
    element: <NotificationKindIcon kind="event_terminated" />,
    scenario: async () => {
      if (!document.querySelector("svg.lucide-trophy"))
        throw new Error("The completed-event icon was not rendered");
    },
  },
  {
    name: "ProfileStats: three concrete totals",
    element: (
      <ProfileStats
        items={[
          { label: "Games played", value: "120" },
          { label: "Games won", value: "40" },
          { label: "Win rate", value: "33%" },
        ]}
      />
    ),
    scenario: async () => {
      screen.getByText("120");
      screen.getByText("40");
      screen.getByText("33%");
    },
  },
  {
    name: "ProfileRatingChart: twenty classified game points",
    element: (
      <ProfileRatingChart
        points={Array.from({ length: 20 }, (_, index) => ({
          ordinal: index + 1,
          rating: 500 + index * 3,
          delta: 3,
        }))}
      />
    ),
    scenario: async () => {
      screen.getByRole("img", { name: "OpenSkill rating history" });
      screen.getByText("Classified games");
    },
  },
  {
    name: "ProfileBggAttribution: real provider attribution",
    element: <ProfileBggAttribution />,
    scenario: async () => {
      screen.getByRole("link", { name: "Powered by BGG — open BoardGameGeek" });
    },
  },
  {
    name: "ProfileVersion: actual manifest version",
    element: <ProfileVersion />,
    scenario: async () => {
      screen.getByTestId("profile-version");
    },
  },
  {
    name: "GameRating: provisional score and positive delta",
    element: <GameRating rating={{ score: 560.55, provisional: true, delta: 12.25 }} showDelta />,
    scenario: async () => {
      screen.getByRole("img", { name: "Provisional game rating" });
      screen.getByRole("img", { name: "Rating increased: +12.25" });
    },
  },
  {
    name: "LeaderboardGameCover: remote game image",
    element: <LeaderboardGameCover imageUrl="https://images.example/game.jpg" />,
    scenario: async () => {
      if (!document.querySelector('img[src="https://images.example/game.jpg"]'))
        throw new Error("Expected the supplied leaderboard image");
    },
  },
  {
    name: "OptionVoteVoters: compact named ballots",
    element: (
      <OptionVoteVoters
        compact
        label="Friday evening"
        voters={{
          YES: [{ userId: "alice", name: "Alice", username: null, avatarUrl: null }],
          IF_NEEDED: [{ userId: "bob", name: "Bob", username: null, avatarUrl: null }],
          NO: [],
        }}
      />
    ),
    scenario: async () => {
      screen.getByLabelText("Votes: Friday evening");
      screen.getByRole("listitem", { name: "If needed: Bob" });
    },
  },
  {
    name: "EventVoteLegend: open table voting rules",
    element: <EventVoteLegend label="Games" scope="table" />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Games: Voting legend" }));
      await screen.findByText(
        "You can vote only if you are an accepted participant at this table.",
      );
    },
  },
  {
    name: "EventSeatListHeading: open waiting-list explanation",
    element: <EventSeatListHeading waiting />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Waiting list: Field help" }));
      await screen.findByText(
        "Accepted players on the waiting list can vote. They may play if an administrator or the app selects them according to the table's rules.",
      );
    },
  },
  {
    name: "EventTableRatingInfo: open finalized-result explanation",
    element: <EventTableRatingInfo enabled />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Rating enabled" }));
      await screen.findByText(
        "This table contributes to player ratings when eligible results are finalized.",
      );
    },
  },
  {
    name: "EventTableGamesPopover: page nine real game rows",
    element: <EventTableGamesPopover name="First table" games={games} />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
      await screen.findByText("Game 1");
      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      await screen.findByText("Game 9");
      fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
      await screen.findByText("Game 1");
    },
  },
];

for (const { name, element, scenario } of cases) {
  test(name, async () => {
    const result = await measureRenders(element, { scenario });
    assertRenderMeasurement(result, name);
  });
}
