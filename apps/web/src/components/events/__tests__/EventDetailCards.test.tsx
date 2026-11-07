import { Avatar, Style } from "@dicebear/core";
import constellation from "@dicebear/styles/constellation.json" with { type: "json" };
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";
import { EventDetailsCard } from "../EventDetailsCard";
import { EventTableInfo } from "../EventTableInfo";
import { EventVoteLegend } from "../EventVoteLegend";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));

it.each([
  ["PLANNING", "Planning", "warning"],
  ["CONFIRMED", "Confirmed", "success"],
  ["TERMINATED", "Terminated", "default"],
] as const)(
  "uses background artwork for %s detail and the same identity in its horizontal list card",
  (status, label, color) => {
    const event = { ...plannedEvent, status, groupId: groupRecord.id, groupName: groupRecord.name };
    const view = renderWithI18n(<EventDetailsCard event={event} />);
    const details = screen.getByRole("region", { name: "Details" });
    const heading = within(details).getByRole("heading", { name: event.name });
    const card = heading.closest(".card") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.querySelector(".absolute.inset-0")).not.toBeNull();
    expect(within(card).getByText(label).closest(".chip")?.className).toContain(`chip--${color}`);
    expect(heading.className).toContain("break-words");
    expect(heading.className).toContain("text-lg");
    expect(within(details).queryByRole("link")).toBeNull();
    expect(within(details).queryByText(groupRecord.name)).toBeNull();
    const image = card.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("");
    const artwork = image?.getAttribute("src");
    expect(artwork).toBe(
      `data:image/svg+xml,${encodeURIComponent(new Avatar(new Style(constellation), { seed: event.id, size: 72 }).toString())}`,
    );
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
  expect(container.querySelector(".skeleton")).toBeNull();
  expect(screen.queryByText("No group")).toBeNull();
});
it("retains the existing voting legend, used in Details below the identity and tabs", () => {
  renderWithI18n(<EventVoteLegend />);
  fireEvent.click(screen.getByRole("button", { name: "Voting legend" }));
  for (const label of ["Yes", "If needed", "No"]) expect(screen.getByText(label)).not.toBeNull();
  expect(
    screen.getByText(
      "Only accepted players vote. Pending players keep a reserved place until accepted. Join at least one table to participate in the event.",
    ),
  ).not.toBeNull();
  expect(screen.queryByText("Unknown")).toBeNull();
});
it.each([true, false])(
  "retains player limits, settings help and rating=%s in the Table background card",
  (enabled) => {
    renderWithI18n(<EventTableInfo table={{ ...plannedTable, rankingEnabled: enabled }} />);
    const section = screen.getByRole("region", { name: "Settings" });
    const heading = within(section).getByRole("heading", { name: plannedTable.name });
    const card = heading.closest(".card") as HTMLElement;
    expect(card.querySelector(".absolute.inset-0")).not.toBeNull();
    const help = within(section).getByRole("button", { name: "Settings: Field help" });
    expect(help.closest(".card")).toBe(card);
    expect(heading.className).toContain("break-words");
    expect(
      within(card).getByRole("img", { name: enabled ? "Rating enabled" : "Rating disabled" }),
    ).not.toBeNull();
    expect(
      within(card).getByText("Minimum players: 2").querySelector("svg.lucide-user-round-check"),
    ).not.toBeNull();
    expect(
      within(card).getByText("Maximum players: 4").querySelector("svg.lucide-users-round"),
    ).not.toBeNull();
    expect(card.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
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
