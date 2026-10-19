import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { GroupCard } from "../GroupCard";
import { GroupDetailsCard } from "../GroupDetailsCard";

const id = "11111111-1111-4111-8111-111111111111";
const base = {
  id,
  adminUserId: "owner",
  type: "PRIVATE",
  approved: { name: "Game Club" },
  reservedNames: [],
  version: 1,
  name: "Game Club",
  logo: null,
  role: "admin",
  myMembership: null,
  createdAt: "2027-01-01T00:00:00Z",
  updatedAt: "2027-01-01T00:00:00Z",
  memberCount: 1,
  eventCount: 0,
  canViewMembers: true,
  canViewEvents: true,
  canViewRankings: true,
  canSocialInteract: true,
  canInvite: true,
  canEdit: true,
} as GroupRecordResponse;
describe("unified group presentation", () => {
  it("keeps private groups unmoderated, optional venues absent, and creator identity accessible", () => {
    renderWithI18n(<GroupCard group={base} pending={false} onRespond={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Open group: Game Club" }).getAttribute("href")).toBe(
      `/groups/${id}`,
    );
    expect(screen.getByRole("img", { name: "Group admin" })).not.toBeNull();
    expect(screen.getByText("Private")).not.toBeNull();
    expect(screen.queryByText("Approved")).toBeNull();
  });
  it("shows explicit consent actions on invited cards; never labels pending users as accepted", () => {
    const respond = vi.fn();
    const invited: GroupRecordResponse = {
      ...base,
      role: "invited",
      canViewEvents: false,
      eventCount: null,
      myMembership: {
        id,
        groupId: id,
        userId: "guest",
        kind: "INVITATION",
        status: "PENDING",
        version: 1,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
      },
    };
    renderWithI18n(<GroupCard group={invited} pending={false} onRespond={respond} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation: Game Club" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline invitation: Game Club" }));
    expect(respond.mock.calls).toEqual([["accept"], ["decline"]]);
    expect(screen.getByText("Invitation received")).not.toBeNull();
    expect(screen.queryByText("Events")).toBeNull();
  });
  it("keeps public moderation status, verified venue and rejection reasons visible without fabricating private counts", () => {
    const group: GroupRecordResponse = {
      ...base,
      type: "PUBLIC",
      location: {
        id,
        name: "Club venue",
        address: "Via Roma 1, Roma, Italia",
        latitude: 41.9,
        longitude: 12.5,
      },
      reviewStatus: "REJECTED",
      rejectionReason: "Please verify the venue",
      canViewEvents: false,
      eventCount: null,
    };
    renderWithI18n(<GroupDetailsCard group={group} />);
    expect(screen.getByText("Changes rejected")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Please verify the venue");
    expect(screen.getByText("Club venue")).not.toBeNull();
    expect(screen.queryByText("Events")).toBeNull();
  });
});
