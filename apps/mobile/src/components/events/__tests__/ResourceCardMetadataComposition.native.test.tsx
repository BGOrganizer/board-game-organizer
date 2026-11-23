import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  type ClientEventRecord,
  type ClientGroupRecord,
  eventRecordSchedulePreview,
} from "@board-game-organizer/shared";
import { render, renderHook, screen, userEvent, within } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import { View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameListRow } from "@/components/games/GameListRow";
import { GroupCard } from "@/components/groups/GroupCard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventCard } from "../EventCard";
import { EventTableCard } from "../EventTableCard";
import { EventTableScheduleCard } from "../EventTableScheduleCard";

const sdk = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => sdk }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
const fetchBoundary = vi.fn(() => {
  throw new Error("Cached card metadata must not fetch or acknowledge notices");
});
beforeEach(() => {
  sdk.push.mockClear();
  fetchBoundary.mockClear();
  vi.stubGlobal("fetch", fetchBoundary);
});
afterEach(() => {
  expect(fetchBoundary).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["en", "it"] as const)(
  "retains real Event/Table/Group card metadata, localized body styles and event-context facts in %s",
  async (locale) => {
    const event: ClientEventRecord = {
      ...plannedEvent,
      groupId: groupRecord.id,
      groupName: groupRecord.name,
      dates: [
        ...plannedEvent.dates,
        { id: "44444444-4444-4444-8444-444444444444", day: "2030-06-04", startTime: "18:15" },
      ],
      locations: [
        ...plannedEvent.locations,
        { ...plannedEvent.locations[0], id: "55555555-5555-4555-8555-555555555555" },
      ],
    };
    const table: PlannedTableResponse = {
      ...plannedTable,
      groupId: groupRecord.id,
      groupName: groupRecord.name,
      eventSchedule: eventRecordSchedulePreview(event),
      gamesDetail: [...plannedTable.gamesDetail, { ...plannedTable.gamesDetail[0], id: 2 }],
    };
    const fixture = (context: "personal" | "event") => (
      <NativeTestProviders locale={locale}>
        <View testID="event-metadata">
          <EventCard event={event} />
        </View>
        <View testID="table-metadata">
          <EventTableCard table={table} context={context} />
        </View>
        <View testID="group-metadata">
          <GroupCard group={groupRecord} />
        </View>
        <View testID="unknown-schedule">
          <EventTableScheduleCard
            table={{
              ...table,
              eventStatus: "CONFIRMED",
              confirmed: {
                gameId: 1,
                playerIds: ["owner", "guest"],
                startsAt: "2030-06-03T18:00:00Z",
              },
              games: [{ gameId: 1 }],
              demonstratorUserId: undefined,
            }}
          />
        </View>
        <View testID="unknown-game-metadata">
          <GameListRow name="Unknown game" />
        </View>
      </NativeTestProviders>
    );
    const palette = await renderHook(() => useThemeColor("muted"), {
      wrapper: NativeTestProviders,
    });
    const view = await render(fixture("personal"));
    const eventRow = within(screen.getByTestId("event-metadata"));
    const tableRow = within(screen.getByTestId("table-metadata"));
    const groupRow = within(screen.getByTestId("group-metadata"));
    expect(eventRow.getByText(event.name)).toBeVisible();
    expect(eventRow.getByText(groupRecord.name)).toBeVisible();
    expect(eventRow.getByText(locale === "it" ? "1 Tavolo" : "1 Table")).toBeVisible();
    expect(tableRow.getByText(locale === "it" ? "Tavolo #1" : "Table #1")).toBeVisible();
    expect(tableRow.getByText(plannedTable.eventName)).toBeVisible();
    expect(tableRow.getByText(groupRecord.name)).toBeVisible();
    expect(
      tableRow.getByText(locale === "it" ? "0/4 partecipanti" : "0/4 participants"),
    ).toBeVisible();
    const title = groupRow.getByText(groupRecord.name);
    expect(title).toHaveStyle({ fontWeight: "600" });
    for (const label of locale === "it" ? ["1 Membro", "0 Eventi"] : ["1 Member", "0 Events"])
      expect(groupRow.getByText(label)).toHaveStyle({
        fontSize: 14,
        color: palette.result.current,
      });
    expect(
      screen
        .getByTestId("group-metadata")
        .queryAll((node) => node.type.startsWith("RNSVG") && Number(node.props.bbWidth) === 16)
        .length,
    ).toBeGreaterThan(0);
    for (const scope of [eventRow, tableRow, groupRow]) {
      expect(scope.getByTestId("card-body-row")).toHaveStyle({ alignItems: "flex-end" });
      expect(scope.getByTestId("card-artwork")).toHaveStyle({ width: 96, height: 96 });
      expect(scope.getByTestId("card-controls")).toBeOnTheScreen();
    }
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
      new Date("2030-06-03T20:00Z"),
    );
    for (const scope of [eventRow, tableRow]) {
      expect(scope.queryByText(date)).toBeNull();
      expect(scope.queryByText("Club venue")).toBeNull();
    }
    const unknown = screen.getByTestId("unknown-schedule");
    expect(
      within(unknown).getByLabelText(locale === "it" ? "Caricamento…" : "Loading…", {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(unknown.queryAll((node) => node.type.startsWith("RNSVG"))).toHaveLength(0);
    const unknownGame = within(screen.getByTestId("unknown-game-metadata"));
    expect(unknownGame.getByText("Unknown game")).toBeVisible();
    expect(
      unknownGame.queryByRole("button", { name: "Game information: Unknown game" }),
    ).toBeNull();
    expect(unknownGame.queryByText(/minutes|minuti/)).toBeNull();
    await view.rerender(fixture("event"));
    expect(tableRow.getByText(plannedTable.eventName)).toBeVisible();
    expect(tableRow.getByText(groupRecord.name)).toBeVisible();
    expect(tableRow.queryByText(date)).toBeNull();
    expect(tableRow.queryByText("Club venue")).toBeNull();
    expect(sdk.push).not.toHaveBeenCalled();
  },
);

it.each(["group", "event"] as const)(
  "keeps actual %s card facts and indicator hosts while only pending draft controls are gated",
  async (kind) => {
    const verify = vi.fn();
    const fixture = (phase?: "saving" | "verifying" | "failed") => {
      const optimistic = phase ? { draftId: "draft", phase } : undefined;
      const group: ClientGroupRecord = { ...groupRecord, optimistic };
      const event: ClientEventRecord = { ...plannedEvent, optimistic };
      return (
        <NativeTestProviders>
          {kind === "group" ? (
            <GroupCard group={group} onVerify={verify} />
          ) : (
            <EventCard event={event} onVerify={verify} />
          )}
        </NativeTestProviders>
      );
    };
    const view = await render(fixture());
    const controlLabel = kind === "group" ? "Private" : "Private event";
    const indicator = screen.getByRole("button", { name: controlLabel });
    const facts = screen.getByTestId("card-facts");
    const artwork = screen.getByTestId("card-artwork");
    const name = kind === "group" ? groupRecord.name : plannedEvent.name;
    const statuses = [
      [undefined, `Open ${kind}`, undefined],
      ["saving", "Saving", "Saving"],
      ["verifying", "Checking saved changes", "Verifying"],
      ["failed", "Not saved. Edit draft", "Not saved"],
    ] as const;
    for (const [phase, status, badge] of statuses) {
      await view.rerender(fixture(phase));
      expect(screen.getByText(name)).toBeVisible();
      for (const fact of kind === "group" ? ["1 Member", "0 Events"] : ["1 Table"])
        expect(within(facts).getByText(fact)).toBeVisible();
      expect(screen.getByTestId("card-facts")).toBe(facts);
      expect(screen.getByTestId("card-artwork")).toBe(artwork);
      expect(screen.getByRole("button", { name: controlLabel, includeHiddenElements: true })).toBe(
        indicator,
      );
      const controls = screen.getByTestId("card-controls", { includeHiddenElements: true });
      expect(controls).toHaveProp("pointerEvents", phase === "saving" ? "none" : "box-none");
      expect(controls).toHaveProp("accessibilityElementsHidden", phase === "saving");
      const navigation = screen.getByRole("button", { name: `${status}: ${name}` });
      if (phase === "saving" || phase === "verifying") {
        expect(navigation).toBeDisabled();
        await userEvent.setup().press(navigation);
        expect(sdk.push).not.toHaveBeenCalled();
      } else expect(navigation).toBeEnabled();
      if (badge) {
        const slot = screen.getByLabelText(badge);
        expect(slot).toHaveStyle({ width: 24, height: 24 });
        expect(screen.queryByText(badge)).toBeNull();
      }
      if (phase === "verifying") {
        await userEvent.setup().press(screen.getByRole("button", { name: "Check saved changes" }));
        expect(verify).toHaveBeenCalledOnce();
        expect(sdk.push).not.toHaveBeenCalled();
      }
    }
    await userEvent
      .setup()
      .press(screen.getByRole("button", { name: `Not saved. Edit draft: ${name}` }));
    expect(sdk.push).toHaveBeenCalledExactlyOnceWith({
      pathname: `/${kind}/wizard`,
      params: { draftId: "draft" },
    });
  },
);
