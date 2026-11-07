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
  [
    [waiting, invitation, request, reg("ACCEPTED", "SELF", "SEATED")],
    "Confirmed player",
    "You have a confirmed place at a table.",
  ],
  [[waiting, invitation, request], "Participation requested", "Your request is awaiting approval."],
  [[waiting, invitation], "Invitation received", "You have received an invitation."],
  [[waiting], "Waiting list", "You are on the waiting list, not assigned a place."],
] as const)("shows one truthful aggregate for %s", async (rows, label, description) => {
  renderWithI18n(
    <EventCard event={{ ...plannedEvent, role: "invited", myRegistrations: [...rows] }} />,
  );
  const button = screen.getByRole("button", {
    name: rows.some((row) => row.kind === "INVITATION" && row.status === "PENDING")
      ? `${label} · Reply required`
      : label,
  });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("link").contains(button)).toBe(false);
  fireEvent.click(button);
  expect(await screen.findByText(description)).not.toBeNull();
});

it("does not award organizer participation, infer queue positions, or keep a position absent from a receipt", () => {
  const event: PlannedEventResponse = { ...plannedEvent, myRegistrations: [] };
  const q = renderWithI18n(<EventCard event={event} />);
  expect(screen.getByRole("button", { name: "Administrator" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  q.rerender(<EventCard event={{ ...event, role: "member" }} />);
  expect(screen.getByRole("button", { name: "Group member" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  q.rerender(<EventCard event={{ ...event, myRegistrations: [reg("ACCEPTED", "SELF")] }} />);
  expect(screen.getByLabelText("Loading…")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  q.rerender(
    <EventCard event={{ ...event, myRegistrations: [reg("ACCEPTED", "SELF", "FROZEN")] }} />,
  );
  expect(screen.getByRole("button", { name: "Confirmed player" })).not.toBeNull();
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
  expect(trigger.parentElement?.className).toContain("flex-wrap");
  expect(document.querySelector(".absolute.left-0.top-0")).toBeNull();
});
