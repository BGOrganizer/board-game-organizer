import { describe, expect, it } from "vitest";
import {
  eventUserRoles,
  groupUserRoles,
  RECORD_USER_ROLES,
  tableUserRoles,
} from "../recordUserRoles";

describe("record participation presentation", () => {
  it("keeps all named roles tied to semantic icons and tones", () => {
    expect(Object.keys(RECORD_USER_ROLES)).toHaveLength(12);
    for (const role of Object.values(RECORD_USER_ROLES)) {
      expect(role.message.length).toBeGreaterThan(0);
      expect(["warning", "accent", "success"]).toContain(role.tone);
    }
  });
  it("never turns acceptance, a reservation or an unknown position into a seat", () => {
    expect(tableUserRoles({ status: "ACCEPTED", kind: "SELF" })).toEqual([]);
    expect(tableUserRoles({ status: "PENDING", kind: "INVITATION", position: "SEATED" })).toEqual([
      "invitedPlayer",
    ]);
    expect(tableUserRoles({ status: "PENDING", kind: "SELF", position: "SEATED" })).toEqual([]);
    expect(tableUserRoles({ status: "PENDING", position: "SEATED" })).toEqual([]);
    expect(tableUserRoles({ status: "DECLINED", position: "WAITING" })).toEqual([]);
    expect(tableUserRoles({ status: "ACCEPTED", position: "SEATED" })).toEqual(["confirmedPlayer"]);
    expect(tableUserRoles({ position: "FROZEN" })).toEqual(["confirmedPlayer"]);
    expect(tableUserRoles({ status: "ACCEPTED", position: "WAITING" })).toEqual(["waitingPlayer"]);
    expect(
      tableUserRoles({
        status: "PENDING",
        kind: "INVITATION",
        position: "WAITING",
        demonstrator: true,
      }),
    ).toEqual(["demonstrator", "invitedPlayer", "waitingPlayer"]);
    expect(tableUserRoles({ demonstrator: true })).toEqual(["demonstrator"]);
  });
  it("shows independent Event duty, management, invitation and queue facts without fabricating consent", () => {
    expect(eventUserRoles({ position: "SEATED" })).toEqual(["acceptedParticipant"]);
    expect(eventUserRoles({ position: "FROZEN", accepted: true })).toEqual(["acceptedParticipant"]);
    expect(eventUserRoles({ position: null, accepted: false, demonstrator: true })).toEqual([
      "demonstrator",
    ]);
    expect(eventUserRoles({ position: null, accepted: false, pendingInvitation: true })).toEqual([
      "invitedParticipant",
    ]);
    expect(eventUserRoles({ position: null, accepted: false })).toEqual([]);
    expect(
      eventUserRoles({ position: "WAITING", accepted: true, managementRole: "moderator" }),
    ).toEqual(["moderator", "waitingParticipant", "acceptedParticipant"]);
    expect(
      eventUserRoles({
        position: "SEATED",
        accepted: true,
        managementRole: "admin",
        demonstrator: true,
        pendingInvitation: true,
        waiting: true,
      }),
    ).toEqual([
      "admin",
      "demonstrator",
      "invitedParticipant",
      "waitingParticipant",
      "acceptedParticipant",
    ]);
    expect(eventUserRoles({ position: null, accepted: false, waiting: true })).toEqual([
      "waitingParticipant",
    ]);
  });
  it("distinguishes Group invitation from membership request and does not label departed users as members", () => {
    expect(groupUserRoles({ isAdmin: true })).toEqual(["admin"]);
    expect(groupUserRoles({ isAdmin: false })).toEqual([]);
    expect(groupUserRoles({ isAdmin: false, membership: null })).toEqual([]);
    expect(
      groupUserRoles({ isAdmin: false, membership: { kind: "REQUEST", status: "PENDING" } }),
    ).toEqual(["requestedMember"]);
    expect(
      groupUserRoles({ isAdmin: false, membership: { kind: "INVITATION", status: "PENDING" } }),
    ).toEqual(["invitedMember"]);
    expect(
      groupUserRoles({
        isAdmin: false,
        membership: { kind: "INVITATION", status: "ACCEPTED", role: "MODERATOR" },
      }),
    ).toEqual(["moderator"]);
    expect(
      groupUserRoles({ isAdmin: false, membership: { kind: "REQUEST", status: "ACCEPTED" } }),
    ).toEqual(["acceptedMember"]);
    expect(
      groupUserRoles({ isAdmin: false, membership: { kind: "REQUEST", status: "LEFT" } }),
    ).toEqual([]);
  });
});
