import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GroupArtwork } from "@/components/groups/GroupArtwork";
import { groupRecord, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";
import { EventDetailsCard } from "../EventDetailsCard";
import { EventRolePopover } from "../EventRolePopover";
import { EventTableCard } from "../EventTableCard";
import { EventTableInfo } from "../EventTableInfo";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));
it("gives long role labels a bounded popover and wrapping text beside a fixed icon", async () => {
  renderWithI18n(<EventRolePopover roles={["acceptedParticipant", "invitedParticipant"]} />);
  fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
  const dialog = await screen.findByRole("dialog");
  const accepted = within(dialog).getByText("Accepted participant");
  expect(dialog.parentElement?.className).toContain("w-80");
  expect(dialog.parentElement?.className).toContain("max-w-[calc(100vw-2rem)]");
  expect(accepted.className).toContain("min-w-0 flex-1");
  expect(accepted.className).toContain("[overflow-wrap:anywhere]");
  expect(accepted.className).not.toMatch(/truncate|line-clamp/);
  expect(accepted.previousElementSibling?.classList.contains("shrink-0")).toBe(true);
  expect(within(dialog).getByText("Participant with pending invitation")).not.toBeNull();
});
it("keeps Event management, accepted waiting participation and demonstrator duty independent on list and detail cards", async () => {
  const event = {
    ...plannedEvent,
    role: "participant" as const,
    canManage: true,
    managementRole: "moderator" as const,
    myDemonstrator: true,
    myRegistrations: [{ ...seat("owner"), position: "WAITING" as const }],
  };
  const view = renderWithI18n(<EventCard event={event} />);
  fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
  let dialog = await screen.findByRole("dialog");
  for (const label of ["Moderator", "Participant on the waiting list", "Demonstrator"])
    expect(within(dialog).getByText(label)).not.toBeNull();
  expect(within(dialog).queryByText("Accepted participant")).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  view.rerender(<EventDetailsCard event={event} />);
  fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
  dialog = await screen.findByRole("dialog");
  for (const label of ["Moderator", "Participant on the waiting list", "Demonstrator"])
    expect(within(dialog).getByText(label)).not.toBeNull();
});
it("does not fabricate participation or management when an Event is view-only", () => {
  const event = {
    ...plannedEvent,
    role: "viewer" as const,
    canManage: false,
    readOnly: true,
    myRegistrations: [],
  };
  const view = renderWithI18n(<EventCard event={event} />);
  expect(screen.queryByRole("button", { name: "Viewer" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Roles and participation" })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Event date and time" })).toBeNull();
  view.rerender(<EventDetailsCard event={event} />);
  expect(screen.queryByRole("button", { name: "Viewer" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Management" })).toBeNull();
  view.rerender(<EventDetailsCard event={{ ...event, role: "member" }} />);
  expect(screen.queryByRole("button", { name: "Group member" })).toBeNull();
});
it("never publishes an inferred viewing role on an unresolved optimistic Event draft", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        role: "viewer",
        myRegistrations: [],
        optimistic: { draftId: "draft", phase: "saving" },
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Viewer" })).toBeNull();
  expect(screen.getByRole("link").getAttribute("aria-disabled")).toBe("true");
});
it("distinguishes a plain Table viewer from a participating or assigned demonstrator", async () => {
  const view = renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        canManage: false,
        myRegistration: null,
        demonstratorUserId: "someone-else",
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Viewer" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Demonstrator" })).toBeNull();
  view.rerender(
    <EventTableCard
      table={{
        ...plannedTable,
        canManage: false,
        myRegistration: seat("owner"),
        myPosition: "SEATED",
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
  expect(within(await screen.findByRole("dialog")).getByText("Confirmed player")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Viewer" })).toBeNull();
  view.rerender(
    <EventTableInfo
      table={{
        ...plannedTable,
        canManage: false,
        myRegistration: null,
        demonstratorUserId: "owner",
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Viewer" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
  expect(within(await screen.findByRole("dialog")).getByText("Demonstrator")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
});
it.each(["invited", "requested"] as const)(
  "retains the existing %s overlay for non-list GroupArtwork consumers",
  (role) => {
    renderWithI18n(<GroupArtwork group={{ ...groupRecord, role }} />);
    const badge = screen.getByRole("img", {
      name: role === "invited" ? "Invitation received" : "Membership requested",
    });
    expect(badge.className).toContain("text-warning");
    expect(
      badge.querySelector(role === "invited" ? ".lucide-mail" : ".lucide-clock-3"),
    ).not.toBeNull();
  },
);
it("does not make an informational role button an action on the entity", async () => {
  renderWithI18n(
    <EventDetailsCard event={{ ...plannedEvent, canManage: true, managementRole: "admin" }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Roles and participation" }));
  expect(within(await screen.findByRole("dialog")).getByText("Admin")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm event" })).toBeNull();
});
