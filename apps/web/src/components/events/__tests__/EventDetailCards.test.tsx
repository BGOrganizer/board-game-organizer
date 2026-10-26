import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";
import { EventDetailsCard } from "../EventDetailsCard";
import { EventTableInfo } from "../EventTableInfo";

it.each([
  ["PLANNING", "Planning", "warning"],
  ["CONFIRMED", "Confirmed", "success"],
  ["TERMINATED", "Terminated", "default"],
] as const)(
  "keeps %s event identity in its first card with linked Group and shared status",
  (status, label, color) => {
    const event = { ...plannedEvent, status, groupId: groupRecord.id, groupName: groupRecord.name };
    const view = renderWithI18n(<EventDetailsCard event={event} />);
    const details = screen.getByRole("region", { name: "Details" });
    const heading = within(details).getByRole("heading", { name: event.name });
    const card = heading.closest(".card");
    if (!card) throw new Error("Missing event card");
    const legend = within(details).getByRole("button", { name: "Voting legend" });
    expect(legend.closest(".card")).toBeNull();
    expect(legend.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByText("Details").previousElementSibling?.classList.contains("lucide-info"),
    ).toBe(true);
    expect(heading.previousElementSibling?.classList.contains("lucide-calendar-days")).toBe(true);
    expect(heading.nextElementSibling?.className).toContain("chip");
    expect(
      within(card as HTMLElement)
        .getByText(label)
        .closest(".chip")?.className,
    ).toContain(`chip--${color}`);
    expect(heading.className).toContain("break-words");
    const link = within(card as HTMLElement).getByRole("link", { name: groupRecord.name });
    expect(link.className).toContain("min-w-0 break-words");
    expect(link.getAttribute("href")).toBe(`/groups/${groupRecord.id}`);
    expect(link.previousElementSibling?.classList.contains("lucide-users-round")).toBe(true);
    expect(heading.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const image = card.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("");
    const artwork = image?.getAttribute("src");
    expect(artwork).toMatch(/^data:image\/svg\+xml,/);
    view.rerender(<EventCard event={event} />);
    expect(document.querySelector("img")?.getAttribute("src")).toBe(artwork);
  },
);
it("omits standalone Group rows instead of inserting a No group item", () => {
  renderWithI18n(<EventDetailsCard event={plannedEvent} />);
  expect(screen.queryByText("No group")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByRole("heading", { name: plannedEvent.name })).not.toBeNull();
});
it("keeps available identity visible while a grouped summary is missing the Group name", () => {
  const { container } = renderWithI18n(
    <EventDetailsCard event={{ ...plannedEvent, groupId: groupRecord.id, groupName: null }} />,
  );
  expect(screen.getByRole("heading", { name: plannedEvent.name })).not.toBeNull();
  expect(container.querySelector(".skeleton")).not.toBeNull();
  expect(screen.queryByText("No group")).toBeNull();
});
it("keeps voting meanings and concise accepted/pending/participation rules in the Details help", () => {
  renderWithI18n(<EventDetailsCard event={plannedEvent} />);
  fireEvent.click(screen.getByRole("button", { name: "Voting legend" }));
  for (const label of ["Yes", "If needed", "No", "Unknown"])
    expect(screen.getByText(label)).not.toBeNull();
  expect(
    screen.getByText(
      "Only accepted players vote. Pending players keep a reserved place until accepted. Join at least one table to participate in the event.",
    ),
  ).not.toBeNull();
  expect(screen.queryByText(/count toward agreement/)).toBeNull();
});
it.each([true, false])(
  "keeps Table identity, player limits and rating=%s inside its Settings card",
  (enabled) => {
    renderWithI18n(<EventTableInfo table={{ ...plannedTable, rankingEnabled: enabled }} />);
    const section = screen.getByRole("region", { name: "Settings" });
    const heading = within(section).getByRole("heading", { name: plannedTable.name });
    const card = heading.closest(".card");
    if (!card) throw new Error("Missing Table card");
    const help = within(section).getByRole("button", { name: "Settings: Field help" });
    expect(help.closest(".card")).toBeNull();
    expect(help.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.previousElementSibling?.classList.contains("lucide-dices")).toBe(true);
    expect(heading.className).toContain("break-words");
    expect(heading.nextElementSibling).toBe(
      within(card as HTMLElement).getByRole("img", {
        name: enabled ? "Rating enabled" : "Rating disabled",
      }),
    );
    expect(
      within(card as HTMLElement)
        .getByText("Minimum players: 2")
        .querySelector("svg.lucide-user-round-check"),
    ).not.toBeNull();
    expect(
      within(card as HTMLElement)
        .getByText("Maximum players: 4")
        .querySelector("svg.lucide-users-round"),
    ).not.toBeNull();
    expect(card.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
    expect(screen.queryByRole("button", { name: "Table name: Field help" })).toBeNull();
    fireEvent.click(help);
    expect(screen.getByText(/The minimum is required for agreement/)).not.toBeNull();
  },
);
it("retains exclusion context only for non-planning tables without a frozen roster", () => {
  const view = renderWithI18n(
    <EventTableInfo table={{ ...plannedTable, eventStatus: "CONFIRMED", confirmed: undefined }} />,
  );
  expect(screen.getByText("Excluded from confirmation")).not.toBeNull();
  view.rerender(
    <EventTableInfo
      table={{
        ...plannedTable,
        eventStatus: "CONFIRMED",
        confirmed: { gameId: 1, playerIds: [], startsAt: plannedEvent.createdAt },
      }}
    />,
  );
  expect(screen.queryByText("Excluded from confirmation")).toBeNull();
  view.rerender(<EventTableInfo table={plannedTable} />);
  expect(screen.queryByText("Excluded from confirmation")).toBeNull();
});
