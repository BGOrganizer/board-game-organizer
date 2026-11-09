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
it("opens the unified Event with normal-flow horizontal artwork, never an implicit organizer seat", () => {
  renderWithI18n(<EventCard event={plannedEvent} />);
  const link = screen.getByRole("link", { name: "Open event: Friday games" });
  expect(link.getAttribute("href")).toBe(`/events/${plannedEvent.id}`);
  expect(
    screen.getByText("1 Table").parentElement?.querySelector("svg.lucide-dices"),
  ).not.toBeNull();
  const image = link.closest(".card")?.querySelector("img");
  expect(image?.className).toContain("h-full w-full object-contain");
  expect(image?.closest(".size-24")?.className).toContain("relative");
  for (const name of ["Accepted participant", "Confirmed player", "Admin"])
    expect(screen.queryByRole("button", { name })).toBeNull();
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
it("keeps all own states cumulative, compact, informational and outside navigation", async () => {
  const fetcher = vi.fn(),
    navigate = vi.fn();
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
          { ...seat("owner"), tableId: "other", kind: "INVITATION", status: "PENDING" },
        ],
      }}
    />,
  );
  screen.getByRole("link").addEventListener("click", navigate);
  for (const name of [
    "Admin",
    "Accepted participant",
    "Participant with pending invitation · Reply required",
    "Participant on the waiting list",
    "Demonstrator",
    "Planning",
    "Private event",
    "Dates and times: Friday games",
    "Locations: Friday games",
  ]) {
    const button = screen.getByRole("button", { name });
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
    screen.getByRole("button", { name: "Admin" }).querySelector(".lucide-crown"),
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});
it.each(["moderator", undefined] as const)(
  "does not invent a known management role (%s)",
  (managementRole) => {
    renderWithI18n(<EventCard event={{ ...plannedEvent, canManage: true, managementRole }} />);
    if (managementRole)
      expect(
        screen.getByRole("button", { name: "Moderator" }).querySelector(".lucide-shield-check"),
      ).not.toBeNull();
    else expect(screen.queryByRole("button", { name: "Moderator" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Management" })).toBeNull();
  },
);
it("never makes a historical author an accepted participant or current manager", () => {
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
  for (const name of ["Admin", "Management", "Accepted participant"])
    expect(screen.queryByRole("button", { name })).toBeNull();
});
it("suppresses stale private roles while retaining four ordinary information controls", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        readOnly: true,
        canManage: true,
        managementRole: "admin",
        myDemonstrator: true,
        myRegistrations: [
          seat("owner"),
          { ...seat("owner"), kind: "INVITATION", status: "PENDING" },
        ],
      }}
    />,
  );
  expect(screen.getAllByRole("button")).toHaveLength(4);
  for (const name of [
    "Planning",
    "Private event",
    "Dates and times: Friday games",
    "Locations: Friday games",
  ])
    expect(screen.getByRole("button", { name })).not.toBeNull();
});
it("does not relabel historical pending SELF requests as invitations or change their consent", () => {
  const registrations = [
    seat("owner"),
    { ...seat("owner"), tableId: "second", kind: "SELF" as const, status: "PENDING" as const },
  ];
  renderWithI18n(<EventCard event={{ ...plannedEvent, myRegistrations: registrations }} />);
  expect(screen.getByRole("button", { name: "Accepted participant" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: /Participant with pending invitation/ })).toBeNull();
  expect(registrations[1].status).toBe("PENDING");
  expect(registrations[1].kind).toBe("SELF");
});
it("retains an invitation at the public cutoff without offering a stale reply", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        groupType: "PUBLIC",
        bookingClosesAt: "2000-01-01T00:00:00Z",
        myRegistrations: [{ ...seat("owner"), kind: "INVITATION", status: "PENDING" }],
      }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Participant with pending invitation" }),
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: /Reply required/ })).toBeNull();
});
it("keeps Group identity loading instead of inventing a name", () => {
  renderWithI18n(<EventCard event={{ ...plannedEvent, groupId: "group", groupName: null }} />);
  expect(screen.getByLabelText("Loading…")).not.toBeNull();
  expect(screen.getByText("1 Table")).not.toBeNull();
});
it.each(["PLANNING", "CONFIRMED", "TERMINATED"] as const)(
  "separates %s state from authorized dates and locations",
  async (status) => {
    const planning = status === "PLANNING",
      label = planning ? "Planning" : status === "CONFIRMED" ? "Confirmed" : "Terminated";
    renderWithI18n(
      <EventCard
        event={{
          ...plannedEvent,
          status,
          participantCount: 3,
          locations: [
            ...plannedEvent.locations,
            {
              ...plannedEvent.locations[0],
              id: "second",
              name: "Second venue",
              address: "Second address",
            },
          ],
          dates: [...plannedEvent.dates, { id: "second", day: "2030-06-04", startTime: "21:30" }],
          confirmed: planning
            ? undefined
            : {
                dateId: "second",
                locationId: plannedEvent.locations[0].id,
                at: plannedEvent.createdAt,
              },
        }}
      />,
    );
    const button = screen.getByRole("button", { name: label });
    expect(
      button.querySelector(
        planning
          ? ".lucide-calendar-clock"
          : status === "CONFIRMED"
            ? ".lucide-calendar-check"
            : ".lucide-flag",
      ),
    ).not.toBeNull();
    expect(button.className).toContain(
      planning ? "text-warning" : status === "CONFIRMED" ? "text-success" : "text-muted",
    );
    fireEvent.click(button);
    const state = await screen.findByRole("dialog");
    expect(within(state).getByText("Players: 3")).not.toBeNull();
    expect(state.querySelector("time")).toBeNull();
    expect(within(state).queryByText("Via Roma 1")).toBeNull();
    await close();
    fireEvent.click(screen.getByRole("button", { name: "Dates and times: Friday games" }));
    const dates = await screen.findByRole("dialog");
    expect(within(dates).getByText("June 4, 2030")).not.toBeNull();
    expect(Boolean(within(dates).queryByText("June 3, 2030"))).toBe(planning);
    expect(dates.querySelectorAll("time")).toHaveLength(planning ? 4 : 2);
    await close();
    fireEvent.click(screen.getByRole("button", { name: "Locations: Friday games" }));
    const locations = await screen.findByRole("dialog");
    expect(within(locations).getByText("Via Roma 1")).not.toBeNull();
    expect(Boolean(within(locations).queryByText("Second address"))).toBe(planning);
  },
);
it("shows empty schedule options explicitly without inventing facts", async () => {
  renderWithI18n(<EventCard event={{ ...plannedEvent, dates: [], locations: [] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Dates and times: Friday games" }));
  expect(await screen.findByText("No date selected")).not.toBeNull();
  await close();
  fireEvent.click(screen.getByRole("button", { name: "Locations: Friday games" }));
  expect(await screen.findByText("No location selected")).not.toBeNull();
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
  expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Planning" })).toBeNull();
  expect(screen.getByText("Saving")).not.toBeNull();
});
