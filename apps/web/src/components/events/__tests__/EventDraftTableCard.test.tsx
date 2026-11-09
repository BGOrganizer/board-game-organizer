import { eventDraft, tableDraft } from "@board-game-organizer/shared";
import { Avatar, Style } from "@dicebear/core";
import planets from "@dicebear/styles/planets.json" with { type: "json" };
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));

import { plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { messages as italian } from "../../../../../../messages/it.js";
import { EventDraftTableCard } from "../EventDraftTableCard";
import { EventTableCard } from "../EventTableCard";
import { EventWizardSummary } from "../EventWizardSummary";

async function closePopover() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

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
])(
  "shows local facts in readonly informational popovers: $badge / $person",
  async ({ badge, person, ...fields }) => {
    const row = { ...tableDraft(plannedTable, plannedEvent.timeZone), ...fields };
    const view = renderWithI18n(<EventDraftTableCard row={row} publicGroup />);
    expect(screen.getByRole("heading", { name: row.name, level: 2 })).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("Chess")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: badge }));
    expect(await screen.findByText("Rating")).toBeTruthy();
    await closePopover();
    fireEvent.click(screen.getByRole("button", { name: `Players: ${row.name}` }));
    expect((await screen.findByText(/Minimum players/)).textContent).toContain(
      String(row.minPlayers),
    );
    expect(screen.getByText(/Maximum players/).textContent).toContain(String(row.maxPlayers));
    await closePopover();
    fireEvent.click(screen.getByRole("button", { name: `Demonstrator: ${row.name}` }));
    expect(await screen.findByText(person)).toBeTruthy();
    await closePopover();
    expect(document.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
    expect(screen.queryByRole("button", { name: /^(Edit|Remove|Join|Invite)/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Planning" })).toBeNull();
    const artwork = document.querySelector("img")?.getAttribute("src");
    view.rerender(
      <EventTableCard
        context="event"
        table={{ ...plannedTable, rankingEnabled: fields.rankingEnabled }}
      />,
    );
    expect(document.querySelector("img")?.getAttribute("src")).toBe(artwork);
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      `data:image/svg+xml,${encodeURIComponent(new Avatar(new Style(planets), { seed: plannedTable.id, size: 72 }).toString())}`,
    );
    expect(
      screen
        .getByRole("button", { name: badge })
        .querySelector(fields.rankingEnabled ? "svg.lucide-trophy" : "svg.lucide-circle-off"),
    ).not.toBeNull();
  },
);
it.each([0, 1, 2])(
  "keeps all %s additional games in the compact informational popover",
  async (remaining) => {
    const row = tableDraft(plannedTable, plannedEvent.timeZone);
    row.games.push(
      ...Array.from({ length: remaining }, (_, index) => ({
        ...row.games[0],
        id: index + 2,
        name: `Hidden game ${index}`,
      })),
    );
    renderWithI18n(<EventDraftTableCard row={row} />);
    expect(screen.queryByText("Chess")).toBeNull();
    expect(screen.queryByText(/Hidden game/)).toBeNull();
    const games = screen.getByRole("button", { name: `Board games: ${row.name}` });
    expect(games.querySelector("svg.lucide-dices")).not.toBeNull();
    fireEvent.click(games);
    expect(await screen.findByText("Chess")).toBeTruthy();
    for (let index = 0; index < remaining; index++)
      expect(screen.getByText(`Hidden game ${index}`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Select/ })).toBeNull();
  },
);
it("does not fabricate a game or an additional count for an empty draft", async () => {
  const row = { ...tableDraft(plannedTable, plannedEvent.timeZone), games: [] };
  renderWithI18n(<EventDraftTableCard row={row} />);
  fireEvent.click(screen.getByRole("button", { name: `Board games: ${row.name}` }));
  expect(await screen.findByText("No games found")).toBeTruthy();
  expect(screen.queryByText("Unknown")).toBeNull();
  expect(screen.queryByText(/^\+\d/)).toBeNull();
});
it("does not show an unavailable demonstrator field in private/standalone review cards", async () => {
  const row = tableDraft(plannedTable, plannedEvent.timeZone);
  renderWithI18n(<EventDraftTableCard row={row} />);
  expect(screen.queryByRole("button", { name: /^Demonstrator:/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: `Board games: ${row.name}` }));
  expect(await screen.findByText("Chess")).toBeTruthy();
});
it("reviews public start, same-day end and combined cutoff before the venue", () => {
  const draft = {
    ...eventDraft(plannedEvent),
    endsWall: "2030-06-03T23:00",
    cutoffWall: "2030-06-02T19:00",
  };
  renderWithI18n(<EventWizardSummary draft={draft} publicGroup />);
  const start = screen.getByText("Start Date and Time"),
    end = screen.getByText("End Date and Time"),
    cutoff = screen.getByText("Registration Deadline Date and Time"),
    location = screen.getByText("Location");
  expect(start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(end.compareDocumentPosition(cutoff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(cutoff.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  for (const label of [start, end, cutoff]) {
    const section = label.closest("section");
    expect(section?.querySelector("li time")).not.toBeNull();
    expect(section?.querySelectorAll("li")).toHaveLength(1);
  }
  expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
});
it("uses the requested Italian registration-deadline label in the grouped summary", () => {
  const i18n = setupI18n({ locale: "it", messages: { it: italian } });
  renderWithI18n(
    <I18nProvider i18n={i18n}>
      <EventWizardSummary
        draft={{
          ...eventDraft(plannedEvent),
          endsWall: "2030-06-03T23:00",
          cutoffWall: "2030-06-02T19:00",
        }}
        publicGroup
      />
    </I18nProvider>,
  );
  expect(
    screen.getByText("Date e ora Termine iscrizioni").closest("section")?.querySelector("li time"),
  ).not.toBeNull();
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
