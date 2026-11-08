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
  const pending = rows.some((row) => row.status === "PENDING");
  const reply = rows.some((row) => row.kind === "INVITATION" && row.status === "PENDING");
  const label = "Accepted participant";
  const description =
    "You are accepted at one or more tables. Open table details for your seat or waiting-list position.";
  renderWithI18n(
    <EventCard event={{ ...plannedEvent, role: "invited", myRegistrations: [...rows] }} />,
  );
  const button = screen.getByRole("button", { name: label });
  expect(screen.getAllByRole("button")).toHaveLength(pending ? 4 : 3);
  expect(screen.getByRole("button", { name: "Waiting list" })).not.toBeNull();
  if (pending)
    expect(
      screen.getByRole("button", {
        name: reply ? "Pending participation · Reply required" : "Pending participation",
      }),
    ).not.toBeNull();
  expect(screen.getByRole("link").contains(button)).toBe(false);
  fireEvent.click(button);
  expect(await screen.findByText(description)).not.toBeNull();
});

it("does not award organizer participation, infer queue positions, or keep a position absent from a receipt", () => {
  const event: PlannedEventResponse = {
    ...plannedEvent,
    canManage: true,
    managementRole: "admin",
    myRegistrations: [],
  };
  const q = renderWithI18n(<EventCard event={event} />);
  expect(screen.getByRole("button", { name: "Administrator" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  q.rerender(
    <EventCard event={{ ...event, role: "member", canManage: false, managementRole: null }} />,
  );
  expect(screen.queryByRole("button", { name: "Administrator" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  q.rerender(<EventCard event={{ ...event, myRegistrations: [reg("ACCEPTED", "SELF")] }} />);
  expect(screen.getByRole("button", { name: "Accepted participant" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  q.rerender(
    <EventCard event={{ ...event, myRegistrations: [reg("ACCEPTED", "SELF", "FROZEN")] }} />,
  );
  expect(screen.getByRole("button", { name: "Accepted participant" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
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
  const trigger = screen.getByRole("button", { name: "Group admin" });
  expect(trigger.parentElement?.className).toContain("flex-nowrap");
  expect(document.querySelector(".absolute.left-0.top-0")).toBeNull();
});
