import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GroupArtwork } from "@/components/groups/GroupArtwork";
import { groupRecord, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";
import { EventDetailsCard } from "../EventDetailsCard";
import { EventTableCard } from "../EventTableCard";
import { EventTableInfo } from "../EventTableInfo";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));
it("keeps Event management, accepted waiting participation and demonstrator duty independent on list and detail cards", () => {
  const event = {
    ...plannedEvent,
    role: "participant" as const,
    canManage: true,
    myDemonstrator: true,
    myRegistrations: [{ ...seat("owner"), position: "WAITING" as const }],
  };
  const view = renderWithI18n(<EventCard event={event} />);
  for (const label of ["Management", "Accepted participant", "Demonstrator"])
    expect(screen.getByRole("button", { name: label })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirmed player" })).toBeNull();
  view.rerender(<EventDetailsCard event={event} />);
  for (const label of ["Management", "Waiting list", "Demonstrator"])
    expect(screen.getByRole("button", { name: label })).not.toBeNull();
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
  expect(screen.getAllByRole("button")).toHaveLength(1);
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
it("distinguishes a plain Table viewer from a participating or assigned demonstrator", () => {
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
  expect(screen.getByRole("button", { name: "Confirmed player" })).not.toBeNull();
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
  expect(screen.getByRole("button", { name: "Demonstrator" })).not.toBeNull();
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
  renderWithI18n(<EventDetailsCard event={{ ...plannedEvent, canManage: true }} />);
  fireEvent.click(screen.getByRole("button", { name: "Management" }));
  expect(
    await screen.findByText("Your current permissions allow managing this item."),
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm event" })).toBeNull();
});
