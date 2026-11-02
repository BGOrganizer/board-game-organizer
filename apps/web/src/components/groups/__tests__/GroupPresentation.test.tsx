import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    renderWithI18n(<GroupCard group={base} />);
    expect(screen.getByRole("link", { name: "Open group: Game Club" }).getAttribute("href")).toBe(
      `/groups/${id}`,
    );
    expect(screen.getByRole("button", { name: "Group admin" })).not.toBeNull();
    expect(screen.getByText("Private")).not.toBeNull();
    expect(screen.queryByText("Approved")).toBeNull();
  });
  it("routes invited cards to details without consent controls or accepted-member capabilities", () => {
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
    renderWithI18n(<GroupCard group={invited} />);
    expect(screen.getByRole("link", { name: "Open group: Game Club" }).getAttribute("href")).toBe(
      `/groups/${id}`,
    );
    expect(screen.queryByRole("button", { name: /Accept invitation/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Decline invitation/ })).toBeNull();
    expect(screen.getByText("Invitation received")).not.toBeNull();
    const badge = screen.getByRole("button", { name: "Invitation received" });
    expect(badge.className).toContain("text-warning");
    expect(badge.parentElement?.className).toContain("top-20");
    expect(badge.parentElement?.className).toContain("justify-center");
    expect(badge.querySelector("svg.lucide-mail")).not.toBeNull();
    expect(screen.getByRole("link").contains(badge)).toBe(false);
    expect(screen.queryByText("Events")).toBeNull();
  });
  it("reuses group metadata for review navigation without exposing invitation actions", () => {
    renderWithI18n(
      <GroupCard
        group={{
          ...base,
          type: "PUBLIC",
          reviewStatus: "PENDING",
          role: "invited",
          myMembership: {
            id,
            groupId: id,
            userId: "moderator",
            kind: "INVITATION",
            status: "PENDING",
            version: 1,
            createdAt: base.createdAt,
            updatedAt: base.updatedAt,
          },
        }}
        href={`/moderation/${id}`}
      />,
    );
    expect(screen.getByRole("link", { name: "Open group: Game Club" }).getAttribute("href")).toBe(
      `/moderation/${id}`,
    );
    expect(screen.getByText("Public")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Accept invitation/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Decline invitation/ })).toBeNull();
  });
  it("marks an outgoing pending Group request with a warning clock and no invitation response actions", () => {
    renderWithI18n(<GroupCard group={{ ...base, role: "requested" }} />);
    const badge = screen.getByRole("button", { name: "Membership requested" });
    expect(badge.className).toContain("text-warning");
    expect(badge.parentElement?.className).toContain("top-20");
    expect(badge.parentElement?.className).toContain("justify-center");
    expect(badge.querySelector("svg.lucide-clock-3")).not.toBeNull();
    expect(screen.getByRole("link").contains(badge)).toBe(false);
    expect(screen.queryByRole("button", { name: /Accept invitation/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Decline invitation/ })).toBeNull();
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
