import type { PlannedTableResponse, TableLeaderboardPlayer } from "@board-game-organizer/schemas";
import { act, cleanup, render, screen, within } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import { type ColorValue, Dimensions, processColor, StyleSheet } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventPlayerCard } from "../EventPlayerCard";
import { EventPlayerRatingPopover } from "../EventPlayerRatingPopover";

let previousWindow: ReturnType<typeof Dimensions.get>;
let previousScreen: ReturnType<typeof Dimensions.get>;
let palette: ColorValue[];
const fetchBoundary = vi.fn(() => {
  throw new Error("Player rating presentation must not fetch or acknowledge notices");
});
const historical = (patch: Partial<PlannedTableResponse> = {}): PlannedTableResponse => ({
  ...plannedTable,
  groupId: "33333333-3333-4333-8333-333333333333",
  eventStatus: "TERMINATED",
  rankingEnabled: true,
  confirmed: {
    gameId: 1,
    playerIds: ["player", "other", "nd"],
    startsAt: plannedTable.createdAt,
  },
  results: {
    entries: [
      { userId: "player", score: "8", rank: 1 },
      { userId: "other", score: "4", rank: 2 },
      { userId: "nd", score: null, rank: null },
    ],
    lowerWins: false,
    tieBreaks: [],
    finalizedAt: plannedTable.createdAt,
  },
  ratingChanges: [{ userId: "player", score: 1234.5, delta: 34.5, provisional: true }],
  groupRatingChanges: [{ userId: "player", score: 678.25, delta: -21.75, provisional: false }],
  ...patch,
});
const live: TableLeaderboardPlayer = {
  userId: "player",
  name: "Player",
  avatarUrl: null,
  score: 9999,
  provisional: true,
  gamesPlayed: 9,
  gamesWon: 1,
  nd: 1,
  globalRating: { score: 600, provisional: false },
  groupRating: { score: 400, provisional: true },
};
function RatingCard({
  table,
  current,
  userId = "player",
}: {
  table: PlannedTableResponse;
  current?: TableLeaderboardPlayer;
  userId?: string;
}) {
  palette = useThemeColor([
    "accent-soft-foreground",
    "success-soft-foreground",
    "danger-soft-foreground",
    "muted",
    "default",
    "warning-soft-foreground",
  ]);
  return (
    <EventPlayerCard name="Player" username="player" avatarUrl={null}>
      <EventPlayerRatingPopover table={table} current={current} userId={userId} name="@player" />
    </EventPlayerCard>
  );
}
function Fixture({
  locale = "en",
  ...props
}: Parameters<typeof RatingCard>[0] & { locale?: "en" | "it" }) {
  return (
    <NativeTestProviders locale={locale}>
      <RatingCard {...props} />
    </NativeTestProviders>
  );
}
function popup() {
  const dialogs = screen.container.queryAll(
    (node) => node.props.role === "dialog" && typeof node.props.onLayout === "function",
  );
  expect(dialogs).toHaveLength(1);
  return dialogs[0];
}
function nativeColor(value: ColorValue | undefined) {
  const color = processColor(value);
  if (typeof color !== "number") throw new Error("Expected an installed HeroUI native color");
  return color >>> 0;
}
function expectGlyphColor(host: ReturnType<typeof screen.getByRole>, color: ColorValue) {
  const glyph = host.queryAll(
    (node) =>
      node.type.startsWith("RNSVG") &&
      Number(node.props.bbWidth) === 16 &&
      Number(node.props.bbHeight) === 16,
  )[0];
  if (!glyph) throw new Error("Expected the actual compact Lucide native glyph");
  const brush = glyph.queryAll((node) => node.type === "RNSVGGroup" && node.props.stroke != null)[0]
    ?.props.stroke;
  expect(brush?.type).toBe(0);
  expect(brush?.payload >>> 0).toBe(nativeColor(color));
}
async function openScope(scope: string) {
  await pressMeasuredPopover(screen.getByRole("button", { name: `${scope}: @player` }));
  return within(popup());
}
function expectProvisional(present: boolean) {
  // The native SVG host carries the SDK role/label, but RNTL does not expose
  // it as an accessible role unless the device's SVG accessibility is modeled.
  const markers = popup().queryAll(
    (node) =>
      node.type.startsWith("RNSVGSvgView") &&
      node.props.accessibilityLabel === "Provisional rating",
  );
  expect(markers).toHaveLength(present ? 1 : 0);
  if (!present) return;
  const marker = markers[0];
  expect(marker).toHaveProp("accessibilityRole", "image");
  expect(Number(marker.props.bbWidth)).toBe(16);
  expect(Number(marker.props.bbHeight)).toBe(16);
  const brush = marker.queryAll(
    (node) => node.type === "RNSVGGroup" && node.props.stroke != null,
  )[0]?.props.stroke;
  expect(brush?.type).toBe(0);
  expect(brush?.payload >>> 0).toBe(nativeColor(palette[5]));
  expect(marker).toBeVisible();
}
beforeEach(async () => {
  previousWindow = Dimensions.get("window");
  previousScreen = Dimensions.get("screen");
  const viewport = { width: 360, height: 800, scale: 1, fontScale: 1 };
  Dimensions.set({ window: viewport, screen: viewport });
  fetchBoundary.mockClear();
  vi.stubGlobal("fetch", fetchBoundary);
  await installNativePopoverMeasurements();
});
afterEach(async () => {
  expect(fetchBoundary).not.toHaveBeenCalled();
  await cleanup();
  await act(() => Dimensions.set({ window: previousWindow, screen: previousScreen }));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { scope: "Global ranking", before: "1,200", after: "1,234.5", delta: "+34.5", provisional: true },
  { scope: "Group ranking", before: "700", after: "678.25", delta: "-21.75", provisional: false },
])("keeps immutable $scope facts, compact hits and actual theme glyphs separate", async (row) => {
  await render(<Fixture table={historical()} current={live} />);
  expect(screen.getByText("@player")).toBeVisible();
  const triggers = ["Global ranking", "Group ranking"].map((scope) =>
    screen.getByRole("button", { name: `${scope}: @player` }),
  );
  for (const [index, trigger] of triggers.entries()) {
    expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44, padding: 0 });
    expectGlyphColor(trigger, palette[index]);
    const surfaces = trigger.queryAll((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.width === 28 && style?.height === 28;
    });
    expect(surfaces).toHaveLength(1);
    expect(nativeColor(StyleSheet.flatten(surfaces[0].props.style).backgroundColor)).toBe(
      nativeColor(palette[4]),
    );
  }
  const rows = screen.container.queryAll((node) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.flexWrap === "nowrap" && style.flexShrink === 0;
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toHaveStyle({ flexDirection: "row", gap: 4 });
  expect(rows[0].children).toHaveLength(2);
  const content = await openScope(row.scope);
  expect(popup()).toHaveStyle({ width: 328 });
  expect(popup()).toHaveProp("accessibilityLabel", `${row.scope}: @player`);
  expect(content.queryByRole("heading")).toBeNull();
  for (const text of [
    "Rating before",
    row.before,
    "Rating after",
    row.after,
    "Rating change",
    row.delta,
  ])
    expect(content.getByText(text)).toBeVisible();
  for (const current of ["9,999", "600", "400"]) expect(content.queryByText(current)).toBeNull();
  const columns = popup().queryAll((node) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.flex === 1 && style.minWidth === 0 && style.justifyContent === "space-between";
  });
  expect(columns).toHaveLength(3);
  const deltaStyle = StyleSheet.flatten(content.getByText(row.delta).props.style);
  expect(nativeColor(deltaStyle.color)).toBe(
    nativeColor(palette[row.delta.startsWith("+") ? 1 : 2]),
  );
  expectProvisional(row.provisional);
});

it.each([{ groupId: null }, { sharedResultsOnly: true }])(
  "never exposes a Group scope through personal/shared-final access %j",
  async (patch) => {
    await render(<Fixture table={historical(patch)} current={live} />);
    expect(screen.queryByRole("button", { name: "Group ranking: @player" })).toBeNull();
    const content = await openScope("Global ranking");
    expect(content.getByText("1,234.5")).toBeVisible();
    expect(content.queryByText("678.25")).toBeNull();
    expect(content.queryByText("400")).toBeNull();
  },
);

it.each(["disabled", "all-ND", "one-finisher"] as const)(
  "keeps both scopes explicitly not updated for %s outcomes",
  async (mode) => {
    const table = historical();
    if (mode === "disabled") table.rankingEnabled = false;
    else if (table.results)
      table.results.entries = [
        {
          userId: "player",
          score: mode === "all-ND" ? null : "8",
          rank: mode === "all-ND" ? null : 1,
        },
      ];
    await render(<Fixture table={table} current={live} />);
    const content = await openScope("Global ranking");
    expect(content.getByText("Ranking not updated")).toBeVisible();
    expect(content.queryByText("Rating before")).toBeNull();
    expect(content.queryByText("9,999")).toBeNull();
    await cleanup();
    await render(<Fixture table={table} current={live} />);
    expect((await openScope("Group ranking")).getByText("Ranking not updated")).toBeVisible();
  },
);

it("distinguishes missing immutable history from not-updated results for old cache receipts", async () => {
  for (const field of ["ratingChanges", "results", "rankingEnabled"] as const) {
    const table = historical();
    // The controlled persisted receipt omits an old field; API DTO validation stays unchanged.
    Reflect.deleteProperty(table, field);
    await render(<Fixture table={table} current={live} />);
    const content = await openScope("Global ranking");
    expect(content.getByText("Historical ranking unavailable")).toBeVisible();
    expect(content.queryByText("Ranking not updated")).toBeNull();
    expect(content.queryByText("9,999")).toBeNull();
    await cleanup();
  }
});

it("retains a rated ND player's established zero delta instead of a current provisional value", async () => {
  const table = historical({
    ratingChanges: [{ userId: "nd", score: 500, delta: 0, provisional: false }],
  });
  await render(<Fixture table={table} userId="nd" current={{ ...live, userId: "nd" }} />);
  const content = await openScope("Global ranking");
  expect(content.getAllByText("500")).toHaveLength(2);
  expect(content.getByText("0")).toBeVisible();
  expect(nativeColor(StyleSheet.flatten(content.getByText("0").props.style).color)).toBe(
    nativeColor(palette[3]),
  );
  expectProvisional(false);
  expect(content.queryByText("9,999")).toBeNull();
});

it("reads current scope-specific values without immutable labels and preserves unavailable state", async () => {
  const table = historical({ eventStatus: "CONFIRMED", confirmed: undefined });
  const view = await render(<Fixture table={table} current={live} />);
  let content = await openScope("Group ranking");
  expect(content.getByRole("heading", { name: "Group ranking" })).toBeVisible();
  expect(content.getByText("400")).toBeVisible();
  expectProvisional(true);
  expect(content.queryByText("600")).toBeNull();
  expect(content.queryByText("Rating before")).toBeNull();
  expect(content.queryByText("Rating change")).toBeNull();
  await view.rerender(<Fixture table={table} />);
  expect(within(popup()).getByText("Ranking unavailable")).toBeVisible();
  expectProvisional(false);
  await cleanup();
  await render(<Fixture table={table} current={live} />);
  content = await openScope("Global ranking");
  expect(content.getByRole("heading", { name: "Global ranking" })).toBeVisible();
  expect(content.getByText("600")).toBeVisible();
  expectProvisional(false);
  expect(content.queryByText("400")).toBeNull();
});

it("uses the Italian scope labels and exact locale-aware history and delta formatting", async () => {
  await render(
    <Fixture
      table={historical({
        ratingChanges: [{ userId: "player", score: 12345.5, delta: 34.5, provisional: true }],
      })}
      locale="it"
    />,
  );
  expect(screen.getByRole("button", { name: "Ranking del gruppo: @player" })).toBeEnabled();
  const content = await openScope("Ranking globale");
  expect(content.getByText("12.345,5")).toBeVisible();
  expect(content.getByText("+34,5")).toBeVisible();
  expect(content.queryByText("12,345.5")).toBeNull();
  expect(content.queryByRole("heading")).toBeNull();
});
