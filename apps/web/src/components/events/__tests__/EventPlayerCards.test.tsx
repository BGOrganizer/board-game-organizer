import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedTable } from "@/test-fixtures/eventRecords";
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
it.each([null, "group"])(
  "shows immutable scoped history, shared positions and unranked ND (%s)",
  async (groupId) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderWithI18n(<EventTableResults table={{ ...finalTable, groupId }} />);
    expect(screen.getByText("@winner")).toBeTruthy();
    expect(screen.queryByText("Winner full name")).toBeNull();
    expect(screen.getAllByRole("img", { name: "Position: #1" })).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Position: ND" }).textContent).toBe("ND");
    expect(screen.getAllByText("1.50")).toHaveLength(2);
    expect(document.querySelectorAll('[title="ND"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Ranking: @winner" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Global ranking")).toBeTruthy();
    expect(within(dialog).getByText("505")).toBeTruthy();
    expect(within(dialog).getByText("+5")).toBeTruthy();
    expect(Boolean(within(dialog).queryByText("Group ranking"))).toBe(Boolean(groupId));
    expect(within(dialog).getAllByText("Rating before")).toHaveLength(groupId ? 2 : 1);
    expect(within(dialog).getAllByText("Rating after")).toHaveLength(groupId ? 2 : 1);
    if (groupId) {
      expect(within(dialog).getByText("497")).toBeTruthy();
      expect(within(dialog).getByText("-3")).toBeTruthy();
    }
    expect(within(dialog).getAllByText("500")).toHaveLength(groupId ? 2 : 1);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("distinguishes ineligible rating updates from missing immutable history without live replacement", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const oneFinisher = {
    ...finalTable,
    results: { ...results, entries: results.entries.filter((row) => row.userId !== "tied") },
  };
  const view = renderWithI18n(<EventTableResults table={oneFinisher} />);
  fireEvent.click(screen.getByRole("button", { name: "Ranking: @winner" }));
  expect(await screen.findByText("Ranking not updated")).toBeTruthy();
  expect(screen.queryByText("+5")).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  view.rerender(<EventTableResults table={{ ...finalTable, ratingChanges: [] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Ranking: @winner" }));
  expect(await screen.findByText("Historical ranking unavailable")).toBeTruthy();
  expect(screen.queryByText("Ranking not updated")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
