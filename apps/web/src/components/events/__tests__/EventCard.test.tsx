import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as itMessages } from "../../../../../../messages/it.js";
import { EventCard } from "../EventCard";

afterEach(() => vi.unstubAllGlobals());
async function close() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

it("opens the unified Event with full-height left artwork and a singular count, never an implicit organizer seat", () => {
  renderWithI18n(<EventCard event={plannedEvent} />);
  const link = screen.getByRole("link", { name: "Open event: Friday games" });
  expect(link.getAttribute("href")).toBe(`/events/${plannedEvent.id}`);
  expect(screen.getByText("1 Table")).not.toBeNull();
  expect(
    screen.getByText("1 Table").parentElement?.querySelector("svg.lucide-dices"),
  ).not.toBeNull();
  expect(
    screen.getByText(plannedEvent.name).closest(".card")?.querySelector("img")?.className,
  ).toContain("h-full w-full object-cover");
  expect(screen.queryByRole("button", { name: "Accepted participant" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Administrator" })).toBeNull();
  expect(screen.queryByText("June 3, 2030")).toBeNull();
});
it.each([0, 1, 2])("localizes %s Table(s) and keeps Group · count on the second row", (count) => {
  const i18n = setupI18n({ locale: "it", messages: { it: itMessages, en } });
  renderWithI18n(
    <I18nProvider i18n={i18n}>
      <EventCard
        context="group"
        event={{ ...plannedEvent, groupId: "group", groupName: "Club", tableCount: count }}
      />
    </I18nProvider>,
  );
  const group = screen.getByText("Club"),
    tables = screen.getByText(`${count} ${count === 1 ? "Tavolo" : "Tavoli"}`);
  expect(group.parentElement?.querySelector("svg.lucide-users-round")).not.toBeNull();
  expect(group.parentElement?.nextElementSibling?.textContent).toBe("·");
  expect(group.compareDocumentPosition(tables) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("link").getAttribute("href")).toContain("?fromGroup=group");
});
it("shows administration, accepted participation, pending invitation and demonstrator duty together in compact framed icons", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        canManage: true,
        managementRole: "admin",
        myDemonstrator: true,
        myRegistrations: [
          { ...seat("owner"), position: "WAITING" },
          { ...seat("owner"), tableId: "other", status: "PENDING" },
        ],
      }}
    />,
  );
  const labels = [
    "Administrator",
    "Accepted participant",
    "Pending participation · Reply required",
    "Demonstrator",
    "Planning",
  ];
  const navigate = vi.fn();
  screen.getByRole("link").addEventListener("click", navigate);
  for (const label of labels) {
    const button = screen.getByRole("button", { name: label });
    expect(button.closest("a")).toBeNull();
    expect(button.parentElement?.className).toContain("justify-end");
    expect(button.querySelector(".size-7.bg-default")).not.toBeNull();
    expect(button.querySelector("svg.size-4")).not.toBeNull();
    expect(button.className).toContain("min-h-11 min-w-11");
    fireEvent.click(button);
    expect(await screen.findByRole("dialog")).not.toBeNull();
    await close();
  }
  expect(
    screen.getByRole("button", { name: "Administrator" }).querySelector("svg.lucide-crown"),
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});
it.each(["moderator", undefined] as const)(
  "distinguishes current moderation from unknown old management metadata (%s)",
  (managementRole) => {
    renderWithI18n(<EventCard event={{ ...plannedEvent, canManage: true, managementRole }} />);
    expect(
      screen
        .getByRole("button", { name: managementRole ? "Group moderator" : "Management" })
        .querySelector("svg.lucide-shield-check"),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Administrator" })).toBeNull();
  },
);
it("never makes a historical author or source role an accepted participant or current manager", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        role: "admin",
        canManage: false,
        managementRole: "admin",
        myRegistrations: [],
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Administrator" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Management" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Accepted participant" })).toBeNull();
});
it("suppresses stale private role/participation fields on a read-only projection", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        readOnly: true,
        canManage: true,
        managementRole: "admin",
        myDemonstrator: true,
        myRegistrations: [seat("owner"), { ...seat("owner"), status: "PENDING" }],
      }}
    />,
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Planning" })).not.toBeNull();
});
it("does not erase pending self requests when another Table has accepted participation", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        myRegistrations: [
          seat("owner"),
          { ...seat("owner"), tableId: "second", kind: "SELF", status: "PENDING" },
        ],
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Accepted participant" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Pending participation" }).className).toContain(
    "text-warning",
  );
});
it("retains pending consent at the exact public cutoff without offering a stale reply action", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        groupType: "PUBLIC",
        bookingClosesAt: "2000-01-01T00:00:00Z",
        myRegistrations: [{ ...seat("owner"), status: "PENDING" }],
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Pending participation" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: /Reply required/ })).toBeNull();
});
it("keeps group identity loading instead of inventing a name", () => {
  renderWithI18n(<EventCard event={{ ...plannedEvent, groupId: "group", groupName: null }} />);
  expect(screen.getByLabelText("Loading…")).not.toBeNull();
  expect(screen.getByText("1 Table")).not.toBeNull();
});
it.each(["PLANNING", "CONFIRMED", "TERMINATED"] as const)(
  "shows %s status with a semantic icon and retains schedule/participant metadata inside help",
  async (status) => {
    const planning = status === "PLANNING";
    const event = {
      ...plannedEvent,
      status,
      participantCount: 3,
      locations: [
        ...plannedEvent.locations,
        { ...plannedEvent.locations[0], id: "second", name: "Second venue" },
      ],
      dates: [...plannedEvent.dates, { id: "second", day: "2030-06-04", startTime: "21:30" }],
      confirmed: planning
        ? undefined
        : {
            dateId: "second",
            locationId: plannedEvent.locations[0].id,
            at: plannedEvent.createdAt,
          },
    };
    renderWithI18n(<EventCard event={event} />);
    const label = planning ? "Planning" : status === "CONFIRMED" ? "Confirmed" : "Terminated";
    const button = screen.getByRole("button", { name: label });
    expect(
      button.querySelector(
        planning
          ? "svg.lucide-calendar-clock"
          : status === "CONFIRMED"
            ? "svg.lucide-calendar-check"
            : "svg.lucide-flag",
      ),
    ).not.toBeNull();
    expect(button.className).toContain(
      planning ? "text-warning" : status === "CONFIRMED" ? "text-success" : "text-muted",
    );
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Players: 3")).not.toBeNull();
    expect(within(dialog).getByText(planning ? "June 3, 2030" : "June 4, 2030")).not.toBeNull();
    if (planning) {
      expect(within(dialog).getByRole("img", { name: "2 proposed dates" }).textContent).toBe("+2");
      expect(within(dialog).getByRole("img", { name: "2 proposed locations" }).textContent).toBe(
        "+2",
      );
    } else {
      expect(
        within(dialog).queryByRole("img", { name: /proposed dates|proposed locations/ }),
      ).toBeNull();
    }
  },
);
it("shows incomplete schedule metadata explicitly inside status help without inventing dates", async () => {
  renderWithI18n(<EventCard event={{ ...plannedEvent, dates: [], locations: [] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Planning" }));
  expect(await screen.findByText("Dates to agree")).not.toBeNull();
  expect(screen.getByText("Locations to agree")).not.toBeNull();
});
it("keeps unresolved optimistic drafts free of server-derived role icons", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        canManage: true,
        managementRole: "admin",
        myDemonstrator: true,
        optimistic: { draftId: "draft", phase: "saving" },
      }}
    />,
  );
  expect(screen.getByRole("link").getAttribute("aria-disabled")).toBe("true");
  expect(screen.queryByRole("button", { name: "Administrator" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Planning" })).toBeNull();
  expect(screen.getByText("Saving")).not.toBeNull();
});
