import { eventDraft, tableDraft } from "@board-game-organizer/shared";
import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventDraftTableCard } from "../EventDraftTableCard";
import { EventWizardSummary } from "../EventWizardSummary";

it.each([
  {
    rankingEnabled: true,
    demonstratorUserId: undefined,
    demonstratorName: undefined,
    badge: "Rated",
    person: "No demonstrator",
  },
  {
    rankingEnabled: false,
    demonstratorUserId: "demo",
    demonstratorName: "Game guide",
    badge: "Unrated",
    person: "Game guide",
  },
  {
    rankingEnabled: true,
    demonstratorUserId: "demo",
    demonstratorName: null,
    badge: "Rated",
    person: "Unknown",
  },
])("shows a readonly table card with $badge and $person", ({ badge, person, ...fields }) => {
  const row = { ...tableDraft(plannedTable, plannedEvent.timeZone), ...fields };
  renderWithI18n(<EventDraftTableCard row={row} />);
  expect(screen.getByText(row.name)).not.toBeNull();
  expect(screen.getByText("Chess")).not.toBeNull();
  expect(screen.getByText(badge)).not.toBeNull();
  expect(screen.getByText(person)).not.toBeNull();
  expect(screen.getByText(/Minimum players/).textContent).toContain(String(row.minPlayers));
  expect(screen.getByText(/Maximum players/).textContent).toContain(String(row.maxPlayers));
  expect(screen.queryByRole("button")).toBeNull();
});
it.each(["Friday group", null])(
  "labels readonly single date/location summary, group=%s",
  (groupName) => {
    renderWithI18n(<EventWizardSummary draft={eventDraft(plannedEvent)} groupName={groupName} />);
    expect(screen.getByText(groupName ?? "No group")).not.toBeNull();
    const date = screen.getByText("Event day").closest("section");
    const location = screen.getByText("Location").closest("section");
    if (!date || !location) throw new Error("Missing labelled summary sections");
    expect(within(date).queryByRole("textbox")).toBeNull();
    expect(within(location).getByText("Club venue")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  },
);
