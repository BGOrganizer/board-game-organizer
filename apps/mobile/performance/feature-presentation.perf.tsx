import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { measureRenders } from "@callstack/reassure-measure";
import { act, fireEvent, screen, userEvent, within } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import { UserRoundCheck, UsersRound } from "lucide-react-native";
import {
  type ContextType,
  createRef,
  type ReactElement,
  type ReactNode,
  useImperativeHandle,
  useState,
} from "react";
import { Keyboard, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContactLegend } from "@/components/contacts/ContactLegend";
import { EventCardIndicators } from "@/components/events/EventCardIndicators";
import { EventPlayerCard } from "@/components/events/EventPlayerCard";
import { EventResultTableCard } from "@/components/events/EventResultTableCard";
import { EventTableScheduleCard } from "@/components/events/EventTableScheduleCard";
import { EventTableSchedulePopover } from "@/components/events/EventTableSchedulePopover";
import { ScoreIdentity } from "@/components/ratings/ScoreIdentity";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const focusedNavigation = {
  isFocused: () => true,
  addListener: () => () => {},
} as unknown as NonNullable<ContextType<typeof NavigationContext>>;

function Providers({ children }: { children: ReactNode }) {
  return (
    <NativeTestProviders>
      <NavigationContext.Provider value={focusedNavigation}>{children}</NavigationContext.Provider>
    </NativeTestProviders>
  );
}

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

async function benchmark(ui: ReactElement, scenario: () => Promise<void>, reset?: () => void) {
  const measured = await measureRenders(ui, {
    wrapper: Providers,
    beforeEach: reset,
    scenario,
  });
  assertRenderMeasurement(measured);
}

it("ContactLegend: open the contact relationship and presence explanation", async () => {
  const dismiss = vi.spyOn(Keyboard, "dismiss");
  await benchmark(
    <ContactLegend
      title="Contacts"
      icon={UsersRound}
      entries={[
        {
          icon: UserRoundCheck,
          label: "Friend",
          color: "success",
          description: "An accepted connection.",
        },
      ]}
    />,
    async () => {
      expect(screen.queryByText("An accepted connection.")).toBeNull();
      await pressMeasuredPopover(screen.getByRole("button", { name: "Contacts: Icon legend" }));
      expect(await screen.findByText("An accepted connection.")).toBeVisible();
      expect(screen.getByText("Online")).toBeVisible();
      expect(screen.getByText("Offline")).toBeVisible();
      expect(dismiss).toHaveBeenCalledOnce();
    },
    () => dismiss.mockClear(),
  );
});

it("EventPlayerCard: retain player identity and show avatar fallback on image failure", async () => {
  await benchmark(
    <EventPlayerCard name="Player" username="handle" avatarUrl="https://images.test/avatar">
      <Text>Game statistics</Text>
    </EventPlayerCard>,
    async () => {
      const image = screen.container.queryAll((node) => node.type === "RCTImageView")[0];
      if (!image) throw new Error("Expected the real native avatar image host");
      await fireEvent(image, "error", { nativeEvent: { error: "Fixture image unavailable" } });
      expect(screen.getByText("P")).toBeVisible();
      expect(screen.getByText("@handle")).toBeVisible();
      expect(screen.getByText("Game statistics")).toBeVisible();
      expect(screen.queryByRole("button")).toBeNull();
    },
  );
});

it("EventResultTableCard: expose the confirmed score summary and request score editing", async () => {
  const open = vi.fn();
  const table = {
    ...plannedTable,
    eventStatus: "CONFIRMED" as const,
    confirmed: {
      gameId: 1,
      playerIds: ["owner", "guest"],
      startsAt: "2030-06-03T18:00:00Z",
    },
  };
  await benchmark(
    <EventResultTableCard table={table} ready busy={false} onPress={open} />,
    async () => {
      expect(screen.getByRole("image", { name: "Scores ready" })).toBeOnTheScreen();
      expect(screen.getByText("2")).toBeVisible();
      expect(open).not.toHaveBeenCalled();
      await userEvent.setup().press(screen.getByRole("button", { name: "Edit scores: Chess" }));
      expect(open).toHaveBeenCalledOnce();
    },
    () => open.mockClear(),
  );
});

it("ScoreIdentity: explain position while retaining the provisional rating and signed delta", async () => {
  const player = { id: "player", name: "Player", username: "handle", email: null, avatarUrl: null };
  const gameRating = { userId: player.id, score: 501.5, delta: -1.5, provisional: true };
  await benchmark(
    <ScoreIdentity player={player} rank={1} showGameRating gameRating={gameRating} />,
    async () => {
      expect(screen.getByText("Player")).toBeVisible();
      expect(screen.getByRole("image", { name: "Provisional game rating" })).toBeOnTheScreen();
      expect(screen.getByText("501.50")).toBeVisible();
      expect(screen.getByLabelText("Rating decreased: -1.50")).toBeOnTheScreen();
      await pressMeasuredPopover(screen.getByRole("button", { name: "Position: #1" }));
      expect(await screen.findByRole("heading", { name: "Position" })).toBeVisible();
      expect(screen.getByText("#1")).toBeVisible();
    },
  );
});

it("Event status popover: shows the chosen date at its original wall time", async () => {
  const event = {
    ...plannedEvent,
    status: "CONFIRMED" as const,
    confirmed: {
      dateId: "44444444-4444-4444-8444-444444444444",
      locationId: plannedEvent.locations[0].id,
      at: plannedEvent.createdAt,
    },
    dates: [
      ...plannedEvent.dates,
      { id: "44444444-4444-4444-8444-444444444444", day: "2030-06-04", startTime: "18:15" },
    ],
  };
  await benchmark(<EventCardIndicators event={event} />, async () => {
    await pressMeasuredPopover(screen.getByRole("button", { name: "Confirmed" }));
    const date = new Date("2030-06-04T18:15Z");
    const day = new Intl.DateTimeFormat("en", { timeZone: "UTC", dateStyle: "long" }).format(date);
    const clock = new Intl.DateTimeFormat("en", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
    expect(screen.getByText("Date and time:")).toBeVisible();
    expect(screen.getByText("Location:")).toBeVisible();
    expect(screen.getByText(day)).toBeVisible();
    expect(screen.getByText(clock)).toBeVisible();
    expect(screen.getByText(plannedEvent.locations[0].address)).toBeVisible();
  });
});

it("EventTableSchedulePopover: retain the open schedule while the confirmed timezone arrives", async () => {
  const table: PlannedTableResponse = {
    ...plannedTable,
    eventStatus: "CONFIRMED",
    groupType: "PUBLIC",
    eventSchedule: undefined,
    confirmed: { gameId: 2, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
    demonstratorUserId: "guide",
    demonstratorName: "Confirmed Guide",
  };
  const driver = createRef<{ publishSchedule: () => void }>();
  function ConfirmedSchedule() {
    const [current, setCurrent] = useState(table);
    useImperativeHandle(
      driver,
      () => ({
        publishSchedule: () =>
          setCurrent({
            ...table,
            eventSchedule: {
              localStartsAt: "2030-06-03T20:00",
              location: null,
              timeZone: "Europe/Rome",
              dateCount: 1,
              locationCount: 0,
            },
          }),
      }),
      [],
    );
    return (
      <>
        <EventTableScheduleCard table={current} timeZone="Europe/Rome" />
        <EventTableSchedulePopover table={current} kind="dates" />
      </>
    );
  }
  await benchmark(<ConfirmedSchedule />, async () => {
    expect(screen.getByText("Confirmed Guide")).toBeVisible();
    await pressMeasuredPopover(screen.getByRole("button", { name: "Dates and times: Table #1" }));
    expect(screen.getByLabelText("Loading…", { includeHiddenElements: true })).toBeOnTheScreen();
    await act(() => driver.current?.publishSchedule());
    expect(screen.queryByLabelText("Loading…", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByRole("heading", { name: "Dates and times" })).toBeVisible();
    const dialogs = screen.container.queryAll(
      (node) => node.props.role === "dialog" && typeof node.props.onLayout === "function",
    );
    expect(dialogs).toHaveLength(1);
    expect(within(dialogs[0]).getByText("June 3, 2030")).toBeVisible();
  });
});
