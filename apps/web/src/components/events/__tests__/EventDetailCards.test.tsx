import { Avatar, Style } from "@dicebear/core";
import constellation from "@dicebear/styles/constellation.json" with { type: "json" };
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { groupRecord, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";
import { EventDetailsCard } from "../EventDetailsCard";
import { EventTableInfo } from "../EventTableInfo";
import { EventVoteLegend } from "../EventVoteLegend";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));

it.each([
  ["PLANNING", "Planning", "warning"],
  ["CONFIRMED", "Confirmed", "success"],
  ["TERMINATED", "Terminated", "muted"],
] as const)(
  "puts the %s identity and compact state controls directly over background artwork",
  (status, label, color) => {
    const event = { ...plannedEvent, status, groupId: groupRecord.id, groupName: groupRecord.name };
    const view = renderWithI18n(<EventDetailsCard event={event} />);
    const details = screen.getByRole("region", { name: "Details" }),
      heading = within(details).getByRole("heading", { name: event.name }),
      card = heading.closest(".card") as HTMLElement;
    expect(card.querySelector(".absolute.inset-0")).not.toBeNull();
    expect(card.querySelector(".bg-surface\\/95")).toBeNull();
    expect(card.querySelector(".bg-background\\/70")).not.toBeNull();
    const trigger = within(card).getByRole("button", { name: label });
    expect(trigger.className).toContain(`text-${color}`);
    expect(trigger.querySelector(".size-7.bg-default")).not.toBeNull();
    expect(heading.className).toContain("break-words");
    expect(within(details).queryByRole("link")).toBeNull();
    expect(within(details).queryByText(groupRecord.name)).toBeNull();
    const image = card.querySelector("img"),
      artwork = image?.getAttribute("src");
    expect(image?.getAttribute("alt")).toBe("");
    expect(artwork).toBe(
      `data:image/svg+xml,${encodeURIComponent(new Avatar(new Style(constellation), { seed: event.id, size: 72 }).toString())}`,
    );
    view.rerender(<EventCard event={event} />);
    expect(document.querySelector("img")?.getAttribute("src")).toBe(artwork);
  },
);
it.each([null, groupRecord.id])(
  "keeps the Event title visible without inventing Group identity (%s)",
  (groupId) => {
    renderWithI18n(<EventDetailsCard event={{ ...plannedEvent, groupId, groupName: null }} />);
    expect(screen.getByRole("heading", { name: plannedEvent.name })).not.toBeNull();
    expect(screen.queryByText("No group")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  },
);
it("keeps accepted, pending and waiting Event participation independent in both detail and list", () => {
  const event = {
    ...plannedEvent,
    canManage: true,
    managementRole: "moderator" as const,
    myDemonstrator: true,
    myRegistrations: [
      { ...seat("owner"), position: "WAITING" as const },
      { ...seat("owner"), tableId: "other", status: "PENDING" as const },
    ],
  };
  const q = renderWithI18n(<EventDetailsCard event={event} />);
  const labels = [
    "Group moderator",
    "Accepted participant",
    "Pending participation",
    "Waiting list",
    "Demonstrator",
    "Planning",
  ];
  for (const label of labels)
    expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).not.toBeNull();
  q.rerender(<EventCard event={event} />);
  for (const label of labels)
    expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).not.toBeNull();
});
it("retains the existing voting legend below the identity and tabs", () => {
  renderWithI18n(<EventVoteLegend />);
  fireEvent.click(screen.getByRole("button", { name: "Voting legend" }));
  for (const label of ["Yes", "If needed", "No"]) expect(screen.getByText(label)).not.toBeNull();
  expect(
    screen.getByText(
      "Only accepted players vote. Pending players keep a reserved place until accepted. Join at least one table to participate in the event.",
    ),
  ).not.toBeNull();
});
it.each([true, false])(
  "retains Table state, rating=%s and player-limit help without list-only option controls",
  async (enabled) => {
    renderWithI18n(<EventTableInfo table={{ ...plannedTable, rankingEnabled: enabled }} />);
    const heading = screen.getByRole("heading", { name: plannedTable.name }),
      card = heading.closest(".card") as HTMLElement;
    expect(card.querySelector(".bg-surface\\/95")).toBeNull();
    expect(
      screen.getByRole("button", { name: enabled ? "Rating enabled" : "Rating disabled" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Dates and times:|^Locations:|^Board games:/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Planning" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Minimum players")).not.toBeNull();
    expect(within(dialog).getByText("Maximum players")).not.toBeNull();
    expect(within(dialog).getByText(/The minimum is required for agreement/)).not.toBeNull();
  },
);
it("retains accepted queue consent independently of the canonical waiting position", () => {
  renderWithI18n(
    <EventTableInfo
      table={{
        ...plannedTable,
        myRegistration: seat("owner"),
        myPosition: "WAITING",
        canManage: true,
        managementRole: "admin",
        demonstratorUserId: "owner",
      }}
    />,
  );
  for (const label of [
    "Administrator",
    "Accepted participant",
    "Waiting list",
    "Demonstrator",
    "Planning",
    "Rating enabled",
  ])
    expect(screen.getByRole("button", { name: label })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
});
it("retains excluded-table context in state help without claiming a frozen roster", () => {
  const view = renderWithI18n(
    <EventTableInfo table={{ ...plannedTable, eventStatus: "CONFIRMED", confirmed: undefined }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
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
