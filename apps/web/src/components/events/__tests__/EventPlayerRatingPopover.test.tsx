import type { PlannedTableResponse, TableLeaderboardPlayer } from "@board-game-organizer/schemas";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { messages as italian } from "../../../../../../messages/it.js";
import { EventPlayerRatingPopover } from "../EventPlayerRatingPopover";

const finalTable: PlannedTableResponse = {
  ...plannedTable,
  eventStatus: "TERMINATED",
  groupId: "group",
  confirmed: { gameId: 1, playerIds: ["player", "other", "nd"], startsAt: plannedTable.createdAt },
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
};
const current: TableLeaderboardPlayer = {
  userId: "player",
  name: "Player",
  avatarUrl: null,
  score: 9999,
  provisional: false,
  gamesPlayed: 5,
  gamesWon: 1,
  nd: 0,
};
function show(table = finalTable, live?: TableLeaderboardPlayer, userId = "player") {
  return renderWithI18n(
    <EventPlayerRatingPopover table={table} userId={userId} name="@player" current={live} />,
  );
}
async function open(scope: "Global" | "Group" = "Global") {
  fireEvent.click(screen.getByRole("button", { name: `${scope} ranking: @player` }));
  return within(await screen.findByRole("dialog"));
}

it("renders adjacent nonwrapping, distinctly colored scope glyphs with existing compact hit targets", () => {
  const view = show();
  const global = screen.getByRole("button", { name: "Global ranking: @player" });
  const group = screen.getByRole("button", { name: "Group ranking: @player" });
  expect(global.parentElement).toBe(group.parentElement);
  expect(view.container.firstElementChild?.className).toContain("flex-nowrap");
  expect(global.nextElementSibling).toBe(group);
  expect(global.querySelector(".lucide-globe")).toBeTruthy();
  expect(group.querySelector(".lucide-users-round")).toBeTruthy();
  expect(global.className).toContain("text-accent-soft-foreground");
  expect(group.className).toContain("text-success-soft-foreground");
  for (const trigger of [global, group]) {
    expect(trigger.className).toContain("min-h-11");
    expect(trigger.className).toContain("min-w-11");
  }
});
it.each(["Global", "Group"] as const)(
  "keeps immutable %s details out of the other scope",
  async (scope) => {
    show(finalTable, current);
    const dialog = await open(scope);
    expect(screen.getByRole("dialog", { name: `${scope} ranking: @player` })).toBeTruthy();
    expect(dialog.queryByRole("heading")).toBeNull();
    expect(dialog.queryByText(`${scope} ranking`)).toBeNull();
    expect(
      screen.getByRole("dialog").querySelector(".lucide-globe, .lucide-users-round"),
    ).toBeNull();
    const metrics = dialog.getByText("Rating before").parentElement?.parentElement;
    expect(metrics?.className).toContain("flex-nowrap");
    expect(metrics?.children).toHaveLength(3);
    expect(dialog.queryByText(`${scope === "Global" ? "Group" : "Global"} ranking`)).toBeNull();
    expect(dialog.getByText("Rating before")).toBeTruthy();
    expect(dialog.getByText("Rating after")).toBeTruthy();
    expect(dialog.getByText("Rating change")).toBeTruthy();
    expect(dialog.getByText(scope === "Global" ? "1,200" : "700")).toBeTruthy();
    expect(dialog.getByText(scope === "Global" ? "1,234.5" : "678.25")).toBeTruthy();
    expect(dialog.getByText(scope === "Global" ? "+34.5" : "-21.75")).toBeTruthy();
    expect(Boolean(dialog.queryByRole("img", { name: "Provisional rating" }))).toBe(
      scope === "Global",
    );
    expect(dialog.queryByText("9,999")).toBeNull();
  },
);
it.each([{ groupId: null }, { groupId: "group", sharedResultsOnly: true }])(
  "exposes only GLOBAL for personal/shared-final access %j",
  async (privacy) => {
    show({ ...finalTable, ...privacy });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Group ranking/ })).toBeNull();
    const dialog = await open();
    expect(dialog.queryByText("Group ranking")).toBeNull();
    expect(dialog.queryByText("678.25")).toBeNull();
  },
);
it.each<[string, Partial<PlannedTableResponse>]>([
  ["disabled", { rankingEnabled: false }],
  [
    "all ND",
    {
      results: { ...finalTable.results!, entries: [{ userId: "player", score: null, rank: null }] },
    },
  ],
  [
    "one finisher",
    { results: { ...finalTable.results!, entries: [{ userId: "player", score: "8", rank: 1 }] } },
  ],
])("retains not-updated state for %s independently in both scopes", async (_state, patch) => {
  show({ ...finalTable, ...patch });
  const dialog = await open("Group");
  expect(dialog.getByText("Ranking not updated")).toBeTruthy();
  expect(dialog.queryByText("Rating before")).toBeNull();
  expect(dialog.queryByText("Rating change")).toBeNull();
});
it.each<[string, Partial<PlannedTableResponse>]>([
  ["missing deltas", { ratingChanges: [] }],
  ["missing results", { results: undefined }],
  ["unknown rating policy", { rankingEnabled: undefined }],
])("retains unavailable historical state for %s", async (_state, patch) => {
  show({ ...finalTable, ...patch });
  const dialog = await open();
  expect(dialog.getByText("Historical ranking unavailable")).toBeTruthy();
  expect(dialog.queryByText("Ranking not updated")).toBeNull();
});
it("preserves a rated ND player's immutable zero delta without inventing a score", async () => {
  show(
    { ...finalTable, ratingChanges: [{ userId: "nd", score: 500, delta: 0, provisional: false }] },
    undefined,
    "nd",
  );
  const dialog = await open();
  expect(dialog.getAllByText("500")).toHaveLength(2);
  const change = dialog.getByText("0");
  expect(change.className).toContain("text-muted");
  expect(change.querySelector(".lucide-minus")).toBeTruthy();
  expect(dialog.queryByRole("img", { name: "Provisional rating" })).toBeNull();
});
it.each(["Global", "Group"] as const)(
  "retains current %s ratings without historical fields",
  async (scope) => {
    show(
      { ...finalTable, eventStatus: "CONFIRMED", confirmed: undefined },
      {
        ...current,
        globalRating: { score: 600, provisional: false },
        groupRating: { score: 400, provisional: true },
      },
    );
    const dialog = await open(scope);
    expect(dialog.getByRole("heading", { name: `${scope} ranking` })).toBeTruthy();
    expect(dialog.getByText(scope === "Global" ? "600" : "400")).toBeTruthy();
    expect(dialog.getByText("Ranking")).toBeTruthy();
    expect(dialog.queryByText("Rating before")).toBeNull();
    expect(dialog.queryByText("Rating change")).toBeNull();
  },
);
it("keeps unavailable current state distinct from missing history", async () => {
  show({ ...finalTable, eventStatus: "CONFIRMED" });
  const dialog = await open();
  expect(dialog.getByText("Ranking unavailable")).toBeTruthy();
  expect(dialog.queryByText("Historical ranking unavailable")).toBeNull();
});
it("reuses Italian scope labels and locale-aware historical number formatting", async () => {
  const i18n = setupI18n({ locale: "it", messages: { it: italian } });
  render(
    <I18nProvider i18n={i18n}>
      <EventPlayerRatingPopover table={finalTable} userId="player" name="@player" />
    </I18nProvider>,
  );
  expect(screen.getByRole("button", { name: "Ranking del gruppo: @player" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ranking globale: @player" }));
  const dialog = within(await screen.findByRole("dialog"));
  expect(
    dialog.getByText(new Intl.NumberFormat("it", { maximumFractionDigits: 2 }).format(1234.5)),
  ).toBeTruthy();
  expect(dialog.getByText("+34,5")).toBeTruthy();
});
