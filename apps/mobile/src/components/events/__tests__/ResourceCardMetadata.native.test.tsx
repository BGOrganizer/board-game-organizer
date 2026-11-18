import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { render, screen } from "@testing-library/react-native";
import { createContext, useContext } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScheduleOptionsPopover } from "@/components/common/ui/ScheduleOptionsPopover";
import { GameCatalogMetadata } from "@/components/games/GameCatalogMetadata";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventSchedulePopover } from "../EventSchedulePopover";
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
      <GameCatalogMetadata />
    </NativeTestProviders>,
  );
  expect(screen.getByLabelText("Caricamento…", { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText("Non indicato")).toBeVisible();
  expect(screen.queryByText(/2030|Durata:|minuti/)).toBeNull();
});

it.each([
  { locale: "en", minutes: 30, label: "30 minutes" },
  { locale: "it", minutes: 30, label: "30 minuti" },
  { locale: "it", minutes: 1, label: "1 minuto" },
] as const)(
  "localizes actual game duration metadata as $label without exposing source fields",
  async ({ locale, minutes, label }) => {
    await render(
      <NativeTestProviders locale={locale}>
        <GameCatalogMetadata durationMinutes={minutes} />
      </NativeTestProviders>,
    );
    expect(screen.getByText(label)).toBeVisible();
    const icons = screen.container.queryAll(
      (node) => node.type.startsWith("RNSVG") && Number(node.props.bbWidth) === 12,
    );
    expect(icons.length).toBeGreaterThan(0);
    expect(screen.queryByText(/BGG|MANUAL|DEFAULT|Duration:|Durata:/)).toBeNull();
  },
);

it.each(["en", "it"] as const)(
  "preserves wall-time proposals rather than shifting either %s schedule date to the device timezone",
  async (locale) => {
    const event = {
      ...plannedEvent,
      dates: [
        ...plannedEvent.dates,
        { id: "44444444-4444-4444-8444-444444444444", day: "2030-06-04", startTime: "18:15" },
      ],
    };
    await render(
      <NativeTestProviders locale={locale}>
        <EventSchedulePopover event={event} kind="dates" />
      </NativeTestProviders>,
    );
    await pressMeasuredPopover(
      screen.getByRole("button", {
        name: `${locale === "it" ? "Date e Orari" : "Dates and times"}: ${event.name}`,
      }),
    );
    for (const iso of ["2030-06-03T20:00Z", "2030-06-04T18:15Z"]) {
      const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
        new Date(iso),
      );
      const time = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(new Date(iso));
      expect(screen.getByText(date)).toBeVisible();
      expect(screen.getByText(time)).toBeVisible();
    }
  },
);

it("renders verified location addresses without repeating optional venue names", async () => {
  await render(
    <NativeTestProviders>
      <EventSchedulePopover event={plannedEvent} kind="locations" />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(
    screen.getByRole("button", { name: `Locations: ${plannedEvent.name}` }),
  );
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
  await pressMeasuredPopover(screen.getByRole("button", { name: `Locations: ${candidate.name}` }));
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
  await pressMeasuredPopover(
    screen.getByRole("button", { name: `Dates and times: ${candidate.name}` }),
  );
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

it("renders all actual game rows with rank, Best-player count and selected game duration", async () => {
  await render(
    <NativeTestProviders>
      <EventTableGamesPopover
        name="Game night"
        games={[
          {
            id: 1,
            name: "Chess",
            imageUrl: null,
            year: 2000,
            rank: 42,
            average: 7.5,
            durationMinutes: 30,
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
          },
        ]}
      />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Board games: Game night" }));
  expect(screen.getByText("Chess")).toBeVisible();
  expect(screen.getByText("30 minutes")).toBeVisible();
  expect(screen.getByLabelText("Rank: 42")).toBeVisible();
  expect(screen.getByLabelText("Best BGG players: 2")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Chess/ })).toBeNull();
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
