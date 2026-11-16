import type {
  PlannedEventResponse,
  TableRegistration,
  TableSeatPosition,
} from "@board-game-organizer/schemas";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));

import { GroupCard } from "@/components/groups/GroupCard";
import { groupRecord, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";
import { EventTableCard } from "../EventTableCard";

const reg = (
  status: TableRegistration["status"],
  kind: TableRegistration["kind"],
  position?: TableSeatPosition,
) => ({ ...seat("owner"), status, kind, position });
const waiting = reg("ACCEPTED", "SELF", "WAITING"),
  invitation = reg("PENDING", "INVITATION"),
  request = reg("PENDING", "SELF");
it.each([
  [waiting, invitation, request, reg("ACCEPTED", "SELF", "SEATED")],
  [waiting, invitation, request],
  [waiting, invitation],
  [waiting],
])("retains accepted consent without hiding simultaneous pending work (%s)", async (...rows) => {
  const reply = rows.some((row) => row.kind === "INVITATION" && row.status === "PENDING");
  renderWithI18n(
    <EventCard event={{ ...plannedEvent, role: "invited", myRegistrations: [...rows] }} />,
  );
  const button = screen.getByRole("button", { name: "Roles and participation" });
  expect(screen.getAllByRole("button", { name: "Roles and participation" })).toHaveLength(1);
  expect(screen.getByRole("link").contains(button)).toBe(false);
  fireEvent.click(button);
  expect(await screen.findByText("Participant on the waiting list")).not.toBeNull();
  if (rows.some((row) => row.position === "SEATED"))
    expect(screen.getByText("Accepted participant")).not.toBeNull();
  else expect(screen.queryByText("Accepted participant")).toBeNull();
  if (reply) {
    expect(screen.getByText("Participant with pending invitation")).not.toBeNull();
    expect(screen.getByText("Open details to accept or decline your invitation.")).not.toBeNull();
  }
});

it("keeps role disclosure separate from organizer seats and unknown queue positions", async () => {
  const event: PlannedEventResponse = {
    ...plannedEvent,
    canManage: true,
    managementRole: "admin",
    myRegistrations: [],
  };
  const q = renderWithI18n(<EventCard event={event} />);
  const roles = () => screen.getByRole("button", { name: "Roles and participation" });
  fireEvent.click(roles());
  expect(await screen.findByText("Admin")).not.toBeNull();
  expect(screen.queryByText("Accepted participant")).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  q.rerender(
    <EventCard
      event={{
        ...event,
        role: "member",
        canManage: false,
        managementRole: null,
        myRegistrations: [reg("ACCEPTED", "SELF")],
      }}
    />,
  );
  fireEvent.click(roles());
  expect(await screen.findByText("You are not registered.")).not.toBeNull();
  expect(screen.queryByText("Admin")).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  q.rerender(
    <EventCard
      event={{
        ...event,
        status: "CONFIRMED",
        myRegistrations: [reg("ACCEPTED", "SELF", "FROZEN")],
      }}
    />,
  );
  fireEvent.click(roles());
  expect(await screen.findByText("Accepted participant")).not.toBeNull();
});

it.each(["group", "event", "table"] as const)(
  "keeps %s artwork stable on rename and distinct across IDs",
  (kind) => {
    const card = (name: string, id?: string) =>
      kind === "group" ? (
        <GroupCard group={{ ...groupRecord, name, id: id ?? groupRecord.id }} />
      ) : kind === "event" ? (
        <EventCard event={{ ...plannedEvent, name, id: id ?? plannedEvent.id }} />
      ) : (
        <EventTableCard table={{ ...plannedTable, name, id: id ?? plannedTable.id }} />
      );
    const q = renderWithI18n(card("Original name"));
    const original = q.container.querySelector("img")?.src;
    expect(original).toBeTruthy();
    q.rerender(card("Renamed item"));
    expect(q.container.querySelector("img")?.src).toBe(original);
    q.rerender(card("Renamed item", "44444444-4444-4444-8444-444444444444"));
    expect(q.container.querySelector("img")?.src).not.toBe(original);
  },
);

it("retains uploaded Group logos and their list-only non-overlay status", () => {
  renderWithI18n(
    <GroupCard group={{ ...groupRecord, logo: "data:image/png;base64,public-artwork" }} />,
  );
  expect(document.querySelector("img")?.getAttribute("src")).toBe(
    "data:image/png;base64,public-artwork",
  );
  const trigger = screen.getByRole("button", { name: "Admin" });
  expect(trigger.parentElement?.className).toContain("flex-wrap");
  expect(document.querySelector(".absolute.left-0.top-0")).toBeNull();
});
