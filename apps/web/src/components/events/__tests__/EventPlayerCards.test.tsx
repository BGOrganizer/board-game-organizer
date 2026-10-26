import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventPlayerCard } from "../EventPlayerCard";
import { EventTableResults } from "../EventTableResults";

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
});
it.each([null, "group"])(
  "shows immutable before/after and signed changes in the genuine %s scope",
  (groupId) => {
    const q = renderWithI18n(
      <EventTableResults
        table={{
          ...plannedTable,
          groupId,
          eventStatus: "TERMINATED",
          results: {
            entries: [
              { userId: "winner", score: "1.50", rank: 1 },
              { userId: "nd", score: null, rank: null },
            ],
            lowerWins: false,
            tieBreaks: [],
            finalizedAt: plannedTable.createdAt,
          },
          resultProfiles: [
            {
              userId: "winner",
              name: "Winner full name",
              username: "winner",
              email: null,
              avatarUrl: "https://example.test/avatar.png",
            },
            { userId: "nd", name: "ND player", email: null, avatarUrl: null },
          ],
          ratingChanges: [{ userId: "winner", score: 505, delta: 5, provisional: false }],
          groupRatingChanges: [{ userId: "winner", score: 497, delta: -3, provisional: false }],
        }}
      />,
    );
    expect(screen.getByText("@winner")).not.toBeNull();
    const card = screen.getByText("Winner full name").closest(".card") as HTMLElement;
    const metric = (label: string) => within(card).getByText(label).parentElement!;
    expect(metric("Rating before").children[1].textContent).toBe(groupId ? "500" : "—");
    expect(metric("Group ranking").children[1].textContent).toBe(groupId ? "497" : "—");
    expect(metric("Global ranking").children[1].textContent).toBe("505");
    expect(metric("Global rating change").children[1].textContent).toBe("+5");
    expect(metric("Group rating change").children[1].textContent).toBe(groupId ? "-3" : "—");
    expect(metric("Score").children[1].textContent).toBe("1.50");
    expect(metric("Score").parentElement?.classList.contains("grid-cols-3")).toBe(true);
    expect(metric("Position").parentElement?.classList.contains("grid-cols-4")).toBe(true);
    expect(
      within(screen.getByText("ND player").closest(".card") as HTMLElement).getAllByText("ND"),
    ).toHaveLength(2);
    q.rerender(
      <EventTableResults
        table={{
          ...plannedTable,
          eventStatus: "TERMINATED",
          results: {
            entries: [{ userId: "winner", score: "0", rank: 1 }],
            lowerWins: true,
            tieBreaks: [],
            finalizedAt: plannedTable.createdAt,
          },
          resultProfiles: [{ userId: "winner", name: "Winner", email: null, avatarUrl: null }],
          ratingChanges: [{ userId: "winner", score: 500, delta: 0, provisional: false }],
        }}
      />,
    );
    expect(document.querySelector(".text-default-500 svg.lucide-plus")).not.toBeNull();
  },
);
