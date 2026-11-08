import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import * as shared from "@board-game-organizer/shared";
import ts from "typescript";
import { expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

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
    "react-native": { View: "View", ScrollView: "ScrollView" },
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
    "./EventCardSchedule": {
      EventCardSchedule: child("events/EventCardSchedule", "EventCardSchedule"),
    },
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
    ["./EventStatusBadge", "EventStatusBadge"],
    ["./EventTableRatingBadge", "EventTableRatingBadge"],
    ["./EventTableGamesPopover", "EventTableGamesPopover"],
    ["./EventTableCardIndicators", "EventTableCardIndicators"],
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
    expect(text(eventTree)).toContain(date);
    expect(text(eventTree)).toContain(
      `${locale === "it" ? "Gruppo" : "Group"}: ${groupRecord.name}`,
    );
    expect(text(eventTree)).toContain("Club venue · Via Roma 1");
    expect(
      nodes(eventTree).filter(
        (node) => node.props.className === "text-sm text-accent-soft-foreground",
      ),
    ).toHaveLength(2);
    for (const node of nodes(eventTree).filter((node) => text(node.props.children) === "+2"))
      expect(node.props.className).toContain("text-accent-soft-foreground");
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
    nodes(evaluate("events/EventCardSchedule", "EventCardSchedule", "en", {})).filter(
      (node) => node.type === "Skeleton",
    ),
  ).toHaveLength(2);
  const empty = evaluate("events/EventCardSchedule", "EventCardSchedule", "it", {
    schedule: { localStartsAt: null, location: null, dateCount: 0, locationCount: 0 },
  });
  expect(text(empty)).toContain("Date da concordare");
  expect(text(empty)).toContain("Luoghi da concordare");
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
  expect(all.some((node) => node.type === "UsersRound" && node.props.size === 18)).toBe(true);
  for (const label of ["Private", "Via Roma 1", "1 members", "0 Events"])
    expect(
      all.find((node) => node.type === "Typography" && text(node) === label)?.props.className,
    ).toBe("text-sm text-foreground");
});
