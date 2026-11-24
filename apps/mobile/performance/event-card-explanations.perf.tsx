import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableLeaderboardPlayer,
} from "@board-game-organizer/schemas";
import { measureRenders } from "@callstack/reassure-measure";
import { act, screen } from "@testing-library/react-native";
import { createRef, useImperativeHandle, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventCardIndicators } from "@/components/events/EventCardIndicators";
import { EventGuestBadge } from "@/components/events/EventGuestBadge";
import { EventPlayerRatingPopover } from "@/components/events/EventPlayerRatingPopover";
import { EventVoteLegend } from "@/components/events/EventVoteLegend";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it("EventCardIndicators: show planning policy and the winners of only included tables", async () => {
  const event: PlannedEventResponse = {
    ...plannedEvent,
    status: "TERMINATED",
    planningMode: "MANUAL",
    playerPreference: "BEST",
    cardSummary: {
      ready: true,
      tables: [
        {
          tableId: plannedTable.id,
          order: 0,
          name: "Original table name",
          confirmedGameName: "Chess",
          confirmed: true,
          ready: true,
          blockers: [],
          myParticipation: "CONFIRMED",
          exclusionReasons: [],
          winners: [
            { userId: "winner", username: "@winner" },
            { userId: "guest", username: null, guestName: "Guest winner" },
          ],
        },
        {
          tableId: "33333333-3333-4333-8333-333333333333",
          order: 1,
          name: "Excluded table",
          confirmed: false,
          ready: false,
          blockers: [],
          myParticipation: "EXCLUDED",
          exclusionReasons: [],
          winners: [],
        },
      ],
    },
  };
  const measured = await measureRenders(<EventCardIndicators event={event} />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      const settings = screen.getByRole("button", { name: "Settings" });
      await pressMeasuredPopover(settings);
      expect(screen.getByText(/Managers arrange seats and the waiting list/)).toBeVisible();
      expect(screen.getByText(/Prefers the player count marked Best on BGG/)).toBeVisible();
      await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
      expect(screen.queryByText(/Managers arrange seats and the waiting list/)).toBeNull();
      await pressMeasuredPopover(screen.getByRole("button", { name: "Terminated" }));
      expect(screen.getByText("Chess")).toBeVisible();
      expect(screen.getByText("@winner, Guest winner")).toBeVisible();
      expect(screen.queryByText("Original table name")).toBeNull();
      expect(screen.queryByText("Table #2")).toBeNull();
    },
  });
  assertRenderMeasurement(measured);
});

it("EventGuestBadge: explain who may vote on behalf of the seated guest", async () => {
  const measured = await measureRenders(<EventGuestBadge />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      const explanation = "This player is a guest. An organizer can vote on their behalf.";
      expect(screen.queryByText(explanation)).toBeNull();
      await pressMeasuredPopover(screen.getByRole("button", { name: "Guest" }));
      expect(screen.getByText(explanation)).toBeVisible();
    },
  });
  assertRenderMeasurement(measured);
});

it("EventVoteLegend: explain eligibility and the single changed choice", async () => {
  const measured = await measureRenders(
    <EventVoteLegend label="Board games" scope="table" singleOption />,
    {
      wrapper: NativeTestProviders,
      scenario: async () => {
        await pressMeasuredPopover(
          screen.getByRole("button", { name: "Board games: Voting legend" }),
        );
        expect(screen.getByText("Yes")).toBeVisible();
        expect(screen.getByText("If needed")).toBeVisible();
        expect(screen.getByText("No")).toBeVisible();
        expect(
          screen.getByText("You can vote only if you are an accepted participant at this table."),
        ).toBeVisible();
        expect(
          screen.getByText(
            "Vote again on the changed option. A No keeps you registered and blocks agreement if you have a seat.",
          ),
        ).toBeVisible();
        expect(screen.queryByText(/Choose at least one/)).toBeNull();
      },
    },
  );
  assertRenderMeasurement(measured);
});

it("EventPlayerRatingPopover: retain the current rating popover through an authoritative update", async () => {
  const table: PlannedTableResponse = {
    ...plannedTable,
    eventStatus: "CONFIRMED",
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  };
  const player: TableLeaderboardPlayer = {
    userId: "owner",
    name: "Owner Player",
    username: "owner",
    avatarUrl: null,
    score: 1250,
    provisional: true,
    gamesPlayed: 8,
    gamesWon: 3,
    nd: 1,
  };
  const driver = createRef<{ update: () => void }>();
  function CurrentRating() {
    const [current, setCurrent] = useState(player);
    useImperativeHandle(
      driver,
      () => ({
        update: () => setCurrent({ ...player, score: 1400, provisional: false }),
      }),
      [],
    );
    return (
      <EventPlayerRatingPopover
        table={table}
        userId={player.userId}
        name="@owner"
        current={current}
      />
    );
  }
  const measured = await measureRenders(<CurrentRating />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      await pressMeasuredPopover(screen.getByRole("button", { name: "Global ranking: @owner" }));
      const title = screen.getByRole("heading", { name: "Global ranking · Chess" });
      expect(screen.getByText("1,250")).toBeVisible();
      expect(screen.getByLabelText("Provisional rating")).toBeOnTheScreen();
      await act(() => driver.current?.update());
      expect(screen.getByRole("heading", { name: "Global ranking · Chess" })).toBe(title);
      expect(screen.getByText("1,400")).toBeVisible();
      expect(screen.queryByText("1,250")).toBeNull();
      expect(screen.queryByLabelText("Provisional rating")).toBeNull();
      expect(screen.queryByText("Rating before")).toBeNull();
    },
  });
  assertRenderMeasurement(measured);
});
