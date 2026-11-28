import type { BggSearchItem, PlannedTableResponse } from "@board-game-organizer/schemas";
import { render, renderHook, screen, userEvent } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import { createContext, useContext } from "react";
import { processColor } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScheduleOptionsPopover } from "@/components/common/ui/ScheduleOptionsPopover";
import { GameListRow } from "@/components/games/GameListRow";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventScheduleSummary } from "../EventScheduleSummary";
import { EventTableGamesPopover } from "../EventTableGamesPopover";
import { EventTableScheduleCard } from "../EventTableScheduleCard";
import { EventTableSchedulePopover } from "../EventTableSchedulePopover";

const Auth = createContext({ userId: "owner" });
vi.mock("@clerk/expo", () => ({ useAuth: () => useContext(Auth) }));
const frozen: PlannedTableResponse = {
  ...plannedTable,
  eventStatus: "CONFIRMED",
  groupType: "PUBLIC",
  startsAt: "2030-06-01T10:00:00Z",
  confirmed: {
    gameId: 2,
    playerIds: ["owner", "guest"],
    startsAt: "2030-06-03T18:00:00Z",
    endsAt: "2030-06-03T18:30:00Z",
  },
  games: [
    { gameId: 1, durationMinutes: 120 },
    { gameId: 2, durationMinutes: 30 },
  ],
  demonstratorUserId: "demo",
  demonstratorName: "Guide",
  demonstratorAvatarUrl: "https://example.test/guide.png",
};
beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it.each(["en", "it"] as const)(
  "renders frozen schedule, start/end times and public demonstrator using the explicit %s locale and destination timezone",
  async (locale) => {
    await render(
      <NativeTestProviders locale={locale}>
        <EventTableScheduleCard table={frozen} timeZone="Asia/Tokyo" />
      </NativeTestProviders>,
    );
    const start = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    }).format(new Date(frozen.confirmed?.startsAt ?? ""));
    const end = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    }).format(new Date(frozen.confirmed?.endsAt ?? ""));
    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "Asia/Tokyo",
    }).format(new Date(frozen.confirmed?.startsAt ?? ""));
    expect(screen.getByText(date)).toBeVisible();
    expect(screen.getByText(start)).toBeVisible();
    expect(screen.getByText(`– ${end}`)).toBeVisible();
    expect(screen.getByText("Guide")).toBeVisible();
    const avatar = screen.container.queryAll((node) => node.type === "RCTImageView")[0];
    if (!avatar) throw new Error("Expected the actual public demonstrator avatar image");
    expect(avatar.props.source).toEqual(
      expect.arrayContaining([expect.objectContaining({ uri: frozen.demonstratorAvatarUrl })]),
    );
    expect(screen.getByText(locale === "it" ? "Dimostratore" : "Demonstrator")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Guide/ })).toBeNull();
    expect(screen.queryByText("120")).toBeNull();
    expect(screen.queryByText(/Duration:|Durata:/)).toBeNull();
  },
);

it.each(["PRIVATE", null] as const)(
  "omits the demonstrator identity on a %s schedule",
  async (groupType) => {
    await render(
      <NativeTestProviders>
        <EventTableScheduleCard table={{ ...frozen, groupType }} timeZone="UTC" />
      </NativeTestProviders>,
    );
    expect(screen.queryByText("Guide")).toBeNull();
    expect(screen.queryByText("Demonstrator")).toBeNull();
    expect(screen.getByLabelText("Table schedule")).toBeTruthy();
  },
);

it("retains an authorized personal demonstrator on a private results projection", async () => {
  await render(
    <NativeTestProviders>
      <EventTableScheduleCard
        table={{
          ...frozen,
          groupType: "PRIVATE",
          personalAccessOnly: true,
          eventStatus: "TERMINATED",
        }}
        timeZone="UTC"
      />
    </NativeTestProviders>,
  );
  expect(screen.getByText("Guide")).toBeVisible();
});

it.each(["planning", "excluded"] as const)(
  "omits a %s table schedule rather than guessing from planning previews",
  async (kind) => {
    await render(
      <NativeTestProviders>
        <EventTableScheduleCard
          table={{
            ...frozen,
            ...(kind === "planning" ? { eventStatus: "PLANNING" } : { confirmed: undefined }),
          }}
          timeZone="UTC"
        />
      </NativeTestProviders>,
    );
    expect(screen.queryByLabelText("Table schedule")).toBeNull();
    expect(screen.queryByText("Guide")).toBeNull();
  },
);

it("keeps an unknown timezone loading, an unnamed public guide explicit and an unknown duration absent", async () => {
  await render(
    <NativeTestProviders locale="it">
      <EventTableScheduleCard
        table={{ ...frozen, demonstratorName: undefined, games: [{ gameId: 2 }] }}
      />
      <GameListRow name="Unknown game" />
    </NativeTestProviders>,
  );
  expect(screen.getByLabelText("Caricamento…", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText("Non indicato")).toBeVisible();
  expect(screen.queryByText(/2030|Durata:|minuti/)).toBeNull();
});

it.each(["en", "it"] as const)(
  "preserves the chosen wall time in the %s schedule summary",
  async (locale) => {
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
    await render(
      <NativeTestProviders locale={locale}>
        <EventScheduleSummary event={event} />
      </NativeTestProviders>,
    );
    const chosen = new Date("2030-06-04T18:15Z");
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
    const time = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    expect(screen.getByText(locale === "it" ? "Data e Ora:" : "Date and time:")).toBeVisible();
    expect(screen.getByText(date.format(chosen))).toBeVisible();
    expect(screen.getByText(time.format(chosen))).toBeVisible();
    expect(screen.queryByText(date.format(new Date("2030-06-03T20:00Z")))).toBeNull();
  },
);

it("renders verified location addresses without repeating optional venue names", async () => {
  await render(
    <NativeTestProviders>
      <EventScheduleSummary
        event={{
          ...plannedEvent,
          status: "TERMINATED",
          confirmed: {
            dateId: plannedEvent.dates[0].id,
            locationId: plannedEvent.locations[0].id,
            at: plannedEvent.createdAt,
          },
        }}
      />
    </NativeTestProviders>,
  );
  expect(screen.getByText("Location:")).toBeVisible();
  expect(screen.getByText("Via Roma 1")).toBeVisible();
  expect(screen.queryByText("Club venue")).toBeNull();
});

it.each(["dates", "locations"] as const)(
  "distinguishes uncached %s metadata from a verified empty option list",
  async (kind) => {
    const label = `${kind === "dates" ? "Dates and times" : "Locations"}: Cached event`;
    const view = await render(
      <NativeTestProviders>
        <ScheduleOptionsPopover name="Cached event" kind={kind} planning rows={undefined} />
      </NativeTestProviders>,
    );
    await pressMeasuredPopover(screen.getByRole("button", { name: label }));
    expect(screen.getByLabelText("Loading…", { includeHiddenElements: true })).toBeTruthy();
    const empty = kind === "dates" ? "No date selected" : "No location selected";
    expect(screen.queryByText(empty)).toBeNull();
    await view.rerender(
      <NativeTestProviders>
        <ScheduleOptionsPopover name="Cached event" kind={kind} planning rows={[]} />
      </NativeTestProviders>,
    );
    expect(screen.getByText(empty)).toBeVisible();
    expect(screen.queryByLabelText("Loading…", { includeHiddenElements: true })).toBeNull();
  },
);

it("does not mistake a stale multi-venue planning preview for a chosen confirmed venue", async () => {
  const candidate = {
    ...frozen,
    eventSchedule: {
      localStartsAt: "2030-06-03T20:00",
      location: plannedEvent.locations[0],
      locationCount: 2,
      dateCount: 1,
    },
  };
  await render(
    <NativeTestProviders>
      <EventTableSchedulePopover table={candidate} kind="locations" />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Locations: Table #1" }));
  expect(screen.getByLabelText("Loading…", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByText("Via Roma 1")).toBeNull();
});

it("keeps a confirmed table date unknown until its cached timezone arrives", async () => {
  const candidate: PlannedTableResponse = { ...frozen, eventSchedule: undefined };
  const view = await render(
    <NativeTestProviders>
      <EventTableSchedulePopover table={candidate} kind="dates" />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Dates and times: Table #1" }));
  expect(screen.getByLabelText("Loading…", { includeHiddenElements: true })).toBeTruthy();
  await view.rerender(
    <NativeTestProviders>
      <EventTableSchedulePopover
        table={{
          ...candidate,
          eventSchedule: {
            localStartsAt: "2030-06-03T20:00",
            location: null,
            timeZone: "Europe/Rome",
            dateCount: 1,
            locationCount: 0,
          },
        }}
        kind="dates"
      />
    </NativeTestProviders>,
  );
  expect(screen.getByText("June 3, 2030")).toBeVisible();
  expect(screen.queryByLabelText("Loading…", { includeHiddenElements: true })).toBeNull();
});

it("omits confirmed schedule icons for a verified empty venue selection", async () => {
  const candidate: PlannedTableResponse = {
    ...frozen,
    eventSchedule: {
      localStartsAt: "2030-06-03T20:00",
      location: null,
      timeZone: "Europe/Rome",
      dateCount: 1,
      locationCount: 0,
      locations: [],
    },
  };
  await render(
    <NativeTestProviders>
      <EventTableSchedulePopover table={candidate} kind="locations" />
    </NativeTestProviders>,
  );
  expect(screen.queryByRole("button")).toBeNull();
});

const chess: BggSearchItem = {
  id: 1,
  name: "Chess",
  imageUrl: null,
  year: 2000,
  rank: 42,
  average: 7.5,
  averageWeight: 3.25,
  minPlayMinutes: 90,
  maxPlayMinutes: 120,
  categories: ["Abstract Strategy"],
  suggestedPlayers: {
    totalVotes: 12,
    fetchedAt: "2030-06-01T00:00:00Z",
    rows: [
      {
        players: 2,
        orMore: false,
        best: 10,
        recommended: 2,
        notRecommended: 0,
        sampleCount: 12,
      },
    ],
  },
};

it("keeps duration in the game information badge in the approved games popover", async () => {
  await render(
    <NativeTestProviders>
      <EventTableGamesPopover name="Game night" games={[{ ...chess, durationMinutes: 30 }]} />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Board games: Game night" }));
  expect(screen.getByText("Chess")).toBeVisible();
  expect(screen.queryByText("30 minutes")).toBeNull();
  expect(screen.getByRole("button", { name: "Game information: Chess" })).toBeVisible();
  expect(screen.queryByText("#42")).toBeNull();
  expect(screen.queryByText("90–120 min")).toBeNull();
  expect(screen.queryByText("Abstract Strategy")).toBeNull();
});

it("opens game data from an independent badge without selecting the game row", async () => {
  const select = vi.fn();
  const palette = await renderHook(() => useThemeColor(["accent", "warning"]), {
    wrapper: NativeTestProviders,
  });
  await render(
    <NativeTestProviders>
      <GameListRow game={chess} name={chess.name} onPress={select} />
    </NativeTestProviders>,
  );
  expect(screen.queryByText("30 minutes")).toBeNull();
  expect(screen.queryByText("#42")).toBeNull();
  await userEvent.setup().press(screen.getByRole("button", { name: chess.name }));
  expect(select).toHaveBeenCalledOnce();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Game information: Chess" }));
  for (const fact of [
    "2000",
    "7.50",
    "#42",
    "90–120 min",
    "2 (83%)",
    "3.25/5",
    "Abstract Strategy",
  ])
    expect(screen.getByText(fact)).toBeVisible();
  const accent = processColor(palette.result.current[0]);
  expect(typeof accent).toBe("number");
  for (const label of ["Year", "Duration", "Best BGG", "Difficulty"]) {
    const paths = screen
      .getByText(`${label}:`)
      .parent?.queryAll((node) => node.type === "RNSVGPath");
    expect(paths?.length).toBeGreaterThan(0);
    for (const path of paths ?? []) {
      expect(path.props.fill).toBeNull();
      expect(path.props.stroke).toEqual({ type: 0, payload: accent });
    }
  }
  const star = screen
    .getByText("BGG rating:")
    .parent?.queryAll((node) => node.type === "RNSVGPath")[0];
  expect(star?.props.fill).toEqual({ type: 0, payload: processColor(palette.result.current[1]) });
  expect(select).toHaveBeenCalledOnce();
});

it("keeps an empty game projection explicit without inventing an option", async () => {
  await render(
    <NativeTestProviders>
      <EventTableGamesPopover name="Game night" games={[]} />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Board games: Game night" }));
  expect(screen.getByText("No games found")).toBeVisible();
});
