import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { chessMetadata, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventPlayerCard } from "../EventPlayerCard";
import { EventTableResults } from "../EventTableResults";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
afterEach(() => vi.unstubAllGlobals());
it("keeps full identity with username or honest missing metadata", () => {
  const q = renderWithI18n(
    <EventPlayerCard name="Full Name" username="player" avatarUrl="https://example.test/avatar.png">
      <span>Stats</span>
    </EventPlayerCard>,
  );
  expect(screen.getByText("@player")).not.toBeNull();
  expect(screen.getByText("Full Name")).not.toBeNull();
  q.rerender(
    <EventPlayerCard name="" avatarUrl={null}>
      Stats
    </EventPlayerCard>,
  );
  expect(screen.getByText("—")).not.toBeNull();
  expect(screen.getByText("?")).not.toBeNull();
  q.rerender(
    <EventPlayerCard name={undefined} avatarUrl={null}>
      Stats
    </EventPlayerCard>,
  );
  expect(q.container.querySelector(".skeleton")).not.toBeNull();
});
const results = {
  entries: [
    { userId: "winner", score: "1.50", rank: 1 },
    { userId: "tied", score: "1.50", rank: 1 },
    { userId: "nd", score: null, rank: null },
  ],
  lowerWins: false,
  tieBreaks: [],
  finalizedAt: plannedTable.createdAt,
};
const finalTable = {
  ...plannedTable,
  eventStatus: "TERMINATED" as const,
  results,
  resultProfiles: [
    {
      userId: "winner",
      name: "Winner full name",
      username: "winner",
      email: null,
      avatarUrl: "https://example.test/avatar.png",
    },
    { userId: "tied", name: "Other winner", username: "tied", email: null, avatarUrl: null },
    { userId: "nd", name: "ND player", email: null, avatarUrl: null },
  ],
  ratingChanges: [{ userId: "winner", score: 505, delta: 5, provisional: false }],
  groupRatingChanges: [{ userId: "winner", score: 497, delta: -3, provisional: false }],
};
it.each([
  { groupId: null, sharedResultsOnly: false, showGroup: false },
  { groupId: "group", sharedResultsOnly: false, showGroup: true },
  { groupId: "group", sharedResultsOnly: true, showGroup: false },
])(
  "discloses immutable ratings and keeps shared positions ($groupId, shared=$sharedResultsOnly)",
  ({ groupId, sharedResultsOnly, showGroup }) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderWithI18n(<EventTableResults table={{ ...finalTable, groupId, sharedResultsOnly }} />);
    expect(screen.getByText("@winner")).toBeTruthy();
    expect(screen.queryByText("Winner full name")).toBeNull();
    expect(screen.getAllByRole("img", { name: "Position: #1" })).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Position: ND" })).toBeTruthy();
    expect(screen.getAllByText("1.50")).toHaveLength(2);
    expect(document.querySelectorAll('[title="ND"]')).toHaveLength(1);
    const trigger = screen.getByRole("button", { name: /Rating details.*@winner/ });
    const listItem = trigger.closest("li");
    if (!listItem) throw new Error("Expected a finished result row");
    const row = within(listItem);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(row.queryByText("Global", { exact: true })).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(row.getByText("Global", { exact: true })).toBeTruthy();
    expect(row.getByText("505")).toBeTruthy();
    expect(row.getByText("+5")).toBeTruthy();
    expect(row.getAllByText("500")).toHaveLength(showGroup ? 2 : 1);
    expect(row.getAllByText("Rating before:")).toHaveLength(showGroup ? 2 : 1);
    expect(row.getAllByText("Rating after:")).toHaveLength(showGroup ? 2 : 1);
    expect(Boolean(row.queryByText("Group", { exact: true }))).toBe(showGroup);
    expect(Boolean(row.queryByText("497"))).toBe(showGroup);
    expect(Boolean(row.queryByText("-3"))).toBe(showGroup);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(row.queryByText("505")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("distinguishes ineligible rating updates from missing immutable history without live replacement", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const oneFinisher = {
    ...finalTable,
    results: { ...results, entries: results.entries.filter((row) => row.userId !== "tied") },
  };
  const view = renderWithI18n(<EventTableResults table={oneFinisher} />);
  const trigger = screen.getByRole("button", { name: /Rating details.*@winner/ });
  fireEvent.click(trigger);
  expect(screen.getByText("Ranking not updated")).toBeTruthy();
  expect(screen.queryByText("+5")).toBeNull();
  fireEvent.click(trigger);
  view.rerender(<EventTableResults table={{ ...finalTable, ratingChanges: [] }} />);
  fireEvent.click(screen.getByRole("button", { name: /Rating details.*@winner/ }));
  expect(screen.getByText("Historical ranking unavailable")).toBeTruthy();
  expect(screen.queryByText("Ranking not updated")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it("offers the usual game information popover on the cover in the finished results header", async () => {
  renderWithI18n(
    <EventTableResults
      table={{
        ...finalTable,
        confirmed: { gameId: 1, playerIds: ["winner", "tied"], startsAt: "2030-06-03T18:00:00Z" },
        gamesDetail: [chessMetadata],
      }}
    />,
  );
  const cover = screen.getByRole("button", { name: "Game information: Chess" });
  expect(cover.querySelector(".chip")).toHaveClass("size-[22px]");
  expect(cover.parentElement).toHaveClass("absolute", "-end-4", "-bottom-4");
  fireEvent.click(cover);
  const details = await screen.findByRole("dialog", { name: "Chess" });
  expect(within(details).getByText("BGG rating:")).toBeVisible();
  expect(within(details).getByText("7.30")).toBeVisible();
  expect(within(details).getByText("Abstract Strategy")).toBeVisible();
});
