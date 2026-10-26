import { eventDraft, tableDraft } from "@board-game-organizer/shared";
import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventDraftTableCard } from "../EventDraftTableCard";
import { EventTableSummaryCard } from "../EventTableSummaryCard";
import { EventWizardSummary } from "../EventWizardSummary";

it.each([
  {
    rankingEnabled: true,
    demonstratorUserId: undefined,
    demonstratorName: undefined,
    badge: "Rating enabled",
    person: "No demonstrator",
  },
  {
    rankingEnabled: false,
    demonstratorUserId: "demo",
    demonstratorName: "Game guide",
    badge: "Rating disabled",
    person: "Game guide",
  },
  {
    rankingEnabled: true,
    demonstratorUserId: "demo",
    demonstratorName: null,
    badge: "Rating enabled",
    person: "Unknown",
  },
])("shows a readonly table card with $badge and $person", ({ badge, person, ...fields }) => {
  const row = { ...tableDraft(plannedTable, plannedEvent.timeZone), ...fields };
  const view = renderWithI18n(<EventDraftTableCard row={row} publicGroup />);
  expect(screen.getByText(row.name)).not.toBeNull();
  expect(screen.getByText("Chess")).not.toBeNull();
  const rating = screen.getByRole("img", { name: badge });
  expect(rating.className).toContain(fields.rankingEnabled ? "chip--primary" : "chip--secondary");
  expect(rating.className).toContain(fields.rankingEnabled ? "chip--accent" : "chip--default");
  expect(screen.getByText("Rating")).not.toBeNull();
  expect(document.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
  expect(screen.getByText(person)).not.toBeNull();
  expect(screen.getByText(/Minimum players/).textContent).toContain(String(row.minPlayers));
  expect(screen.getByText(/Maximum players/).textContent).toContain(String(row.maxPlayers));
  expect(screen.queryByRole("button")).toBeNull();
  const artwork = document.querySelector("img")?.getAttribute("src"),
    style = rating.className;
  view.rerender(
    <EventTableSummaryCard table={{ ...plannedTable, rankingEnabled: fields.rankingEnabled }} />,
  );
  expect(document.querySelector("img")?.getAttribute("src")).toBe(artwork);
  expect(screen.getByRole("img", { name: badge }).className).toBe(style);
});
it.each([0, 1, 2])(
  "shows only the first game with its icon and %s additional games",
  (remaining) => {
    const row = tableDraft(plannedTable, plannedEvent.timeZone);
    row.games.push(
      ...Array.from({ length: remaining }, (_, index) => ({
        ...row.games[0],
        id: index + 2,
        name: `Hidden game ${index}`,
      })),
    );
    renderWithI18n(<EventDraftTableCard row={row} />);
    const game = screen.getByText("Chess");
    expect(game.closest("p")?.querySelector("svg.lucide-dices")).not.toBeNull();
    expect(screen.queryByText(/Hidden game/)).toBeNull();
    if (remaining) {
      expect(screen.getByText(`+${remaining}`)).not.toBeNull();
      expect(
        screen.getByText(`+${remaining} ${remaining === 1 ? "game" : "games"}`).className,
      ).toContain("sr-only");
    } else expect(screen.queryByText(/^\+\d/)).toBeNull();
  },
);
it("does not fabricate a game or an additional count for an empty draft", () => {
  const row = { ...tableDraft(plannedTable, plannedEvent.timeZone), games: [] };
  renderWithI18n(<EventDraftTableCard row={row} />);
  expect(screen.getByText("Unknown")).not.toBeNull();
  expect(screen.queryByText(/^\+\d/)).toBeNull();
});
it("does not show an unavailable demonstrator field in private/standalone review cards", () => {
  renderWithI18n(<EventDraftTableCard row={tableDraft(plannedTable, plannedEvent.timeZone)} />);
  expect(screen.queryByText("No demonstrator")).toBeNull();
  expect(screen.getByText("Chess")).not.toBeNull();
});
it("reviews public start, same-day end and combined cutoff before the venue", () => {
  const draft = {
    ...eventDraft(plannedEvent),
    endsWall: "2030-06-03T23:00",
    cutoffWall: "2030-06-03T19:00",
  };
  renderWithI18n(<EventWizardSummary draft={draft} publicGroup />);
  const start = screen.getByText("Start Date and Time"),
    end = screen.getByText("End Date and Time"),
    cutoff = screen.getByText("Booking cutoff"),
    location = screen.getByText("Location");
  expect(start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(end.compareDocumentPosition(cutoff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(cutoff.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
});
it.each(["Friday group", null])(
  "labels readonly single date/location summary, group=%s",
  (groupName) => {
    renderWithI18n(<EventWizardSummary draft={eventDraft(plannedEvent)} groupName={groupName} />);
    expect(screen.getByText(groupName ?? "No group")).not.toBeNull();
    const date = screen.getByText("Date and time").closest("section");
    const location = screen.getByText("Location").closest("section");
    if (!date || !location) throw new Error("Missing labelled summary sections");
    expect(within(date).queryByRole("textbox")).toBeNull();
    expect(within(location).getByText("Club venue")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  },
);
