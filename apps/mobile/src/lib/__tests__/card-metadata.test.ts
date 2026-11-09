import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import * as shared from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

it.each(["en", "it"])(
  "requires real known role fixtures for manual Card people acceptance in %s",
  (language) => {
    const source = readFileSync(
      new URL("../../../.maestro/helpers/card-inputs.js", import.meta.url),
      "utf8",
    );
    const make = (person: object) => {
      const output: Record<string, string> = {};
      runInNewContext(source, {
        output,
        CARD_LOCALE: language,
        CARD_GROUP_NAME: "Group",
        CARD_EVENT_NAME: "Event",
        CARD_TABLE_NAME: "Table",
        CARD_EVENT_DATE_LABEL: "Date",
        CARD_EVENT_TIME_LABEL: "20:00",
        CARD_VENUE: "Venue",
        CARD_VENUE_ADDRESS: "Address",
        CARD_PEOPLE_INPUT: JSON.stringify(person),
      });
      return output;
    };
    const person = {
      username: "@known.user",
      groupRole: "moderator",
      eventRole: "moderator",
      tableStatus: "waiting",
    };
    const result = make(person);
    expect(new RegExp(result.cardPerson).test("@known.user")).toBe(true);
    expect(new RegExp(result.cardPerson).test("@knownXuser")).toBe(false);
    expect(result.cardOverview).toBe(language === "it" ? "^Dettagli$" : "^Details$");
    expect(result.cardRankingTab).toBe("^Ranking$");
    expect(
      new RegExp(result.cardEventRole).test(language === "it" ? "Moderatore" : "Moderator"),
    ).toBe(true);
    for (const patch of [
      { username: "" },
      { groupRole: "none" },
      { eventRole: "invented" },
      { tableStatus: "seated-without-proof" },
    ])
      expect(() => make({ ...person, ...patch })).toThrow();
  },
);

import {
  groupRecord,
  plannedEvent,
  plannedTable,
} from "../../../../web/src/test-fixtures/eventRecords";
import { createAppI18n, translate } from "../i18n";

// Evaluate real native JSX/formatters with host primitives stubbed. Not native layout/touch acceptance.
type Node = { type: string; props: Record<string, unknown> };
function evaluate(file: string, name: string, locale: "en" | "it", props: Record<string, unknown>) {
  const i18n = createAppI18n(locale);
  const jsx = (
    type: string | ((p: Record<string, unknown>) => unknown),
    p: Record<string, unknown>,
  ) => (typeof type === "function" ? type(p) : { type, props: p });
  const child = (file: string, name: string) => (p: Record<string, unknown>) =>
    evaluate(file, name, locale, p);
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": {
      View: "View",
      ScrollView: "ScrollView",
      useWindowDimensions: () => ({ width: 320, height: 640 }),
      FlatList: (p: any) =>
        jsx("FlatList", {
          ...p,
          children: p.data.length
            ? p.data.map((item: unknown) => p.renderItem({ item }))
            : p.ListEmptyComponent,
        }),
    },
    "expo-router": { useRouter: () => ({ push() {} }) },
    "@lingui/react": { useLingui: () => ({ i18n }) },
    "heroui-native/text": { Typography: "Typography" },
    "heroui-native/skeleton": { Skeleton: "Skeleton" },
    "heroui-native/button": { Button: "Button" },
    "heroui-native/hooks": { useThemeColor: (keys: string | string[]) => keys },
    "lucide-react-native": new Proxy({}, { get: (_target, key) => String(key) }),
    "@/lib/i18n": { useT: () => (value: string) => translate(i18n, value) },
    "@/lib/useCommunityApi": { useCommunityApi: () => ({ userId: "viewer" }) },
    "@board-game-organizer/shared": {
      ...shared,
      useEventCutoff: () => false,
      useNotificationAttentionContext: () => undefined,
    },
    "@/components/common/ui/DateTimeInfo": {
      DateTimeInfo: child("common/ui/DateTimeInfo", "DateTimeInfo"),
    },
    "@/components/common/ui/ScheduleOptionsPopover": {
      ScheduleOptionsPopover: child("common/ui/ScheduleOptionsPopover", "ScheduleOptionsPopover"),
    },
    "./DateTimeInfo": { DateTimeInfo: child("common/ui/DateTimeInfo", "DateTimeInfo") },
    "./GroupedRow": { GroupedRow: "GroupedRow" },
    "./HelpPopover": { HelpPopover: "HelpPopover" },
    "@/components/common/ui/ListCardBody": {
      ListCardBody: child("common/ui/ListCardBody", "ListCardBody"),
    },
    "./NotificationUnreadDot": { NotificationUnreadDot: "NotificationUnreadDot" },
    "@/components/common/ui/ClientRecordBadge": {
      ClientRecordBadge: "ClientRecordBadge",
      useClientRecordStatus: () => "",
    },
  };
  for (const [path, component] of [
    ["@/components/common/ui/LinkedListCard", "LinkedListCard"],
    ["@/components/common/ui/ListCard", "ListCard"],
    ["@/components/common/ui/GroupedList", "GroupedList"],
    ["@/components/common/ui/UserListRow", "UserListRow"],
    ["@/components/common/ui/ArtworkStatusPopover", "ArtworkStatusPopover"],
    ["@/components/common/ui/AnimatedDicebearArtwork", "AnimatedDicebearArtwork"],
    ["./GroupArtwork", "GroupArtwork"],
    ["./GroupStatusBadge", "GroupStatusBadge"],
    ["./GroupCardIndicators", "GroupCardIndicators"],
    ["./EventTableRatingBadge", "EventTableRatingBadge"],
    ["./EventTableGamesPopover", "EventTableGamesPopover"],
    ["./EventTableCardIndicators", "EventTableCardIndicators"],
    ["./EventCardIndicators", "EventCardIndicators"],
  ])
    modules[path] = { [component]: component };
  const source = readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
  const exports: Record<string, (props: Record<string, unknown>) => unknown> = {};
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  runInNewContext(code, {
    exports,
    Intl,
    require: (id: string) => {
      if (!(id in modules)) throw new Error(`Unexpected native dependency: ${id}`);
      return modules[id];
    },
  });
  return exports[name](props);
}
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value && typeof value === "object" && "props" in value) {
    const node = value as Node;
    return [node, ...nodes(node.props.children)];
  }
  return [];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (value && typeof value === "object" && "props" in value)
    return text((value as Node).props.children);
  return value === null || value === undefined || typeof value === "boolean" ? "" : String(value);
}
it.each(["en", "it"] as const)(
  "formats native Event and personal Table metadata consistently in %s",
  (locale) => {
    const event = {
      ...plannedEvent,
      groupId: groupRecord.id,
      groupName: groupRecord.name,
      dates: [...plannedEvent.dates, { id: "other", day: "2030-06-04", startTime: "18:15" }],
      locations: [...plannedEvent.locations, { ...plannedEvent.locations[0], id: "other" }],
    };
    const schedule = shared.eventRecordSchedulePreview(event);
    const eventTree = evaluate("events/EventCard", "EventCard", locale, { event });
    const table = {
      ...plannedTable,
      groupId: groupRecord.id,
      groupName: groupRecord.name,
      eventSchedule: schedule,
      gamesDetail: [...plannedTable.gamesDetail, { ...plannedTable.gamesDetail[0], id: 2 }],
    };
    const tableTree = evaluate("events/EventTableCard", "EventTableCard", locale, {
      table,
      context: "personal",
    });
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
      new Date("2030-06-03T20:00Z"),
    );
    expect(text(eventTree)).toContain(groupRecord.name);
    expect(text(eventTree)).toContain(locale === "it" ? "1 Tavolo" : "1 Table");
    expect(text(eventTree)).not.toContain(date);
    expect((eventTree as Node).props.artworkLayout).toBe("cover");
    expect(((eventTree as Node).props.leadingActions as Node).type).toBe("EventCardIndicators");
    const scheduleTree = evaluate("events/EventSchedulePopover", "EventSchedulePopover", locale, {
      event,
      kind: "dates",
    });
    expect(text(scheduleTree)).toContain(date);
    expect(nodes(scheduleTree).filter((node) => node.type === "GroupedRow")).toHaveLength(2);
    const locations = evaluate("events/EventSchedulePopover", "EventSchedulePopover", locale, {
      event,
      kind: "locations",
    });
    expect(text(locations)).toContain("Via Roma 1");
    expect(text(locations)).not.toContain("Club venue");
    expect(text(tableTree)).toContain(groupRecord.name);
    expect(text(tableTree)).toContain(plannedTable.eventName);
    expect(text(tableTree)).toContain(locale === "it" ? "0/4 partecipanti" : "0/4 participants");
    expect((tableTree as Node).props.artworkLayout).toBe("cover");
    const contextual = evaluate("events/EventTableCard", "EventTableCard", locale, {
      table,
      context: "event",
    });
    expect(text(contextual)).not.toContain(date);
    expect(text(contextual)).not.toContain("Club venue");
    expect(text(contextual)).toContain(plannedTable.eventName);
    expect(text(contextual)).toContain(groupRecord.name);
    expect(((contextual as Node).props.leadingActions as Node).type).toBe(
      "EventTableCardIndicators",
    );
  },
);
it("keeps missing native cached metadata as partial skeletons and known empty options explicit", () => {
  expect(
    nodes(
      evaluate("common/ui/ScheduleOptionsPopover", "ScheduleOptionsPopover", "en", {
        name: "Event",
        kind: "dates",
        planning: true,
      }),
    ).filter((node) => node.type === "Skeleton"),
  ).toHaveLength(1);
  for (const kind of ["dates", "locations"]) {
    const empty = evaluate("common/ui/ScheduleOptionsPopover", "ScheduleOptionsPopover", "en", {
      name: "Event",
      kind,
      planning: true,
      rows: [],
    });
    expect(text(empty)).toContain(kind === "dates" ? "No date selected" : "No location selected");
  }
});
it.each(["en", "it"] as const)(
  "renders the included native Table schedule and public user item in %s",
  (locale) => {
    const table = {
      ...plannedTable,
      eventStatus: "CONFIRMED",
      groupType: "PUBLIC",
      startsAt: "2030-06-01T10:00:00Z",
      confirmed: { gameId: 2, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
      games: [
        { gameId: 1, durationMinutes: 120 },
        { gameId: 2, durationMinutes: 30 },
      ],
      demonstratorUserId: "demo",
      demonstratorName: "Guide",
      demonstratorAvatarUrl: "https://example.test/guide.png",
    };
    const tree = evaluate("events/EventTableScheduleCard", "EventTableScheduleCard", locale, {
      table,
      timeZone: "Asia/Tokyo",
    });
    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "Asia/Tokyo",
    }).format(new Date(table.confirmed.startsAt));
    expect(text(tree)).toContain(date);
    expect(text(tree)).toContain(locale === "it" ? "Durata: 30 minuti" : "Duration: 30 minutes");
    expect(text(tree)).not.toContain("120");
    const row = nodes(tree).find((n) => n.type === "UserListRow");
    expect(row?.props).toMatchObject({
      name: "Guide",
      avatarUrl: table.demonstratorAvatarUrl,
      secondary: locale === "it" ? "Dimostratore" : "Demonstrator",
    });
    expect(row?.props.onPress).toBeUndefined();
    for (const groupType of ["PRIVATE", null]) {
      const other = evaluate("events/EventTableScheduleCard", "EventTableScheduleCard", locale, {
        table: { ...table, groupType },
        timeZone: "UTC",
      });
      expect(nodes(other).some((n) => n.type === "UserListRow")).toBe(false);
    }
    expect(
      evaluate("events/EventTableScheduleCard", "EventTableScheduleCard", locale, {
        table: { ...table, eventStatus: "PLANNING" },
        timeZone: "UTC",
      }),
    ).toBeNull();
    expect(
      evaluate("events/EventTableScheduleCard", "EventTableScheduleCard", locale, {
        table: { ...table, confirmed: undefined },
        timeZone: "UTC",
      }),
    ).toBeNull();
  },
);
it("does not fabricate native cached dates or unknown selected durations", () => {
  const table = {
    ...plannedTable,
    eventStatus: "CONFIRMED",
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
    games: [{ gameId: 1 }],
    groupType: "PUBLIC",
    demonstratorUserId: "demo",
  };
  const tree = evaluate("events/EventTableScheduleCard", "EventTableScheduleCard", "it", { table });
  expect(text(tree)).toContain("Durata: Non indicato");
  expect(nodes(tree).some((n) => n.type === "Skeleton")).toBe(true);
  expect(nodes(tree).some((n) => n.type === "CalendarDays")).toBe(false);
  expect(nodes(tree).find((n) => n.type === "UserListRow")?.props.name).toBe("Non indicato");
  const source = readFileSync(
    new URL("../../components/events/EventTableOverview.tsx", import.meta.url),
    "utf8",
  );
  expect(source.indexOf("<EventTableScheduleCard")).toBeGreaterThan(
    source.indexOf("<EventTableInfo"),
  );
  expect(source.indexOf("<EventTableScheduleCard")).toBeLessThan(
    source.indexOf('context === "personal"'),
  );
  const single = evaluate("events/EventTableScheduleCard", "EventTableScheduleCard", "it", {
    table: { ...table, games: [{ gameId: 1, durationMinutes: 1 }], demonstratorUserId: undefined },
    timeZone: "UTC",
  });
  expect(text(single)).toContain("Durata: 1 minuto");
});
it("uses the real common native title component and normal body size for Group metadata", () => {
  const group = { ...groupRecord, location: plannedEvent.locations[0] };
  const tree = evaluate("groups/GroupCard", "GroupCard", "en", { group });
  const all = nodes(tree),
    title = all.find((node) => node.type === "Typography" && text(node) === group.name);
  expect(title?.props.className).toBe("font-semibold text-foreground");
  expect(all.some((node) => node.type === "UsersRound" && node.props.size === 16)).toBe(true);
  expect((tree as Node).props.artworkLayout).toBe("cover");
  expect(((tree as Node).props.leadingActions as Node).type).toBe("GroupCardIndicators");
  for (const label of ["1 Member", "0 Events"])
    expect(
      all.find((node) => node.type === "Typography" && text(node) === label)?.props.className,
    ).toBe("text-sm text-muted");
});
