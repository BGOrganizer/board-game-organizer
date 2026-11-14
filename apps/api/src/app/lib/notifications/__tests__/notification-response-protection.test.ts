import type { Notification } from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import { notificationRequiresResponse } from "../notification-response-protection";

const groupId = "11111111-1111-4111-8111-111111111111";
const tableId = "22222222-2222-4222-8222-222222222222";
const note = (kind: Notification["kind"], href = "/contacts") => ({
  recipientUserId: "recipient",
  kind,
  href,
});
describe("notificationRequiresResponse source policy", () => {
  it.each([undefined, { id: "domain-transaction" }])(
    "checks only current recipient pending invitations, not SELF or queue registrations (%j)",
    async (session) => {
      const findOne = vi
        .fn()
        .mockResolvedValueOnce({ status: "PENDING" })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: "PENDING" })
        .mockResolvedValueOnce(null);
      const collection = vi.fn(() => ({ findOne }));
      const db = { collection } as never;
      expect(
        await notificationRequiresResponse(
          db,
          note("group_invitation", `/groups/${groupId}`),
          session as never,
        ),
      ).toBe(true);
      expect(
        await notificationRequiresResponse(
          db,
          note("group_invitation", `/groups/${groupId}`),
          session as never,
        ),
      ).toBe(false);
      expect(
        await notificationRequiresResponse(
          db,
          note("table_invitation", `/events/${groupId}/tables/${tableId}`),
          session as never,
        ),
      ).toBe(true);
      expect(
        await notificationRequiresResponse(
          db,
          note("table_invitation", `/events/${groupId}/tables/${tableId}`),
          session as never,
        ),
      ).toBe(false);
      expect(findOne.mock.calls[0]).toEqual([
        { groupId, userId: "recipient", kind: "INVITATION", status: "PENDING" },
        session ? { session } : {},
      ]);
      expect(findOne.mock.calls[2]).toEqual([
        { tableId, userId: "recipient", kind: "INVITATION", status: "PENDING" },
        session ? { session } : {},
      ]);
      expect(collection.mock.calls[0]).toEqual(["groupMemberships"]);
      expect(collection.mock.calls[2]).toEqual(["tableRegistrations"]);
    },
  );
  it("does not query fabricated IDs or lock historical decision kinds unread forever", async () => {
    const collection = vi.fn();
    const db = { collection } as never;
    expect(await notificationRequiresResponse(db, note("group_invitation"))).toBe(false);
    expect(await notificationRequiresResponse(db, note("table_invitation"))).toBe(false);
    expect(collection).not.toHaveBeenCalled();
    for (const kind of [
      "group_membership_requested",
      "group_review_requested",
      "event_agreement_ready",
      "event_proposal_created",
    ] as const)
      expect(await notificationRequiresResponse(db, note(kind))).toBe(false);
    for (const kind of [
      "follow",
      "event_booking_confirmed",
      "event_booking_removed",
      "event_agreement_blocked",
      "group_membership_updated",
    ] as const)
      expect(await notificationRequiresResponse(db, note(kind))).toBe(false);
  });
});
