import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  type EventCreationIntent,
  eventCreationMatches,
  eventCreationRecord,
} from "../eventOptimisticCreation";

const cid = "11111111-1111-4111-8111-111111111111",
  groupId = "22222222-2222-4222-8222-222222222222";
const intent: EventCreationIntent = {
  draftId: "10",
  submittedAt: Date.parse("2030-06-01T10:00:00Z"),
  status: "pending",
  error: null,
  variables: {
    clientRequestId: cid,
    groupId: null,
    name: "Friday games",
    startTime: "20:00",
    timeZone: "Europe/Rome",
    dates: [{ id: cid, day: "2030-06-03" }],
    locations: [
      {
        id: cid,
        name: "Club",
        address: "Via Roma 1",
        latitude: 41.9,
        longitude: 12.5,
        timeZone: "Europe/Rome",
      },
    ],
    tables: [
      {
        name: "First table",
        minPlayers: 2,
        maxPlayers: 4,
        games: [{ gameId: 1 }],
        rankingEnabled: true,
      },
    ],
  },
};

describe("provisional Event creation", () => {
  it("shows known input but cannot grant permissions, a seat, priority or an API resource identity", () => {
    const row = eventCreationRecord(intent, "owner");
    expect(row).toMatchObject({
      id: `optimistic:${cid}`,
      clientRequestId: cid,
      adminUserId: "owner",
      name: "Friday games",
      tableCount: 1,
      participantCount: 0,
      groupName: null,
      groupType: null,
      myRegistrations: [],
      optimistic: { draftId: "10", phase: "saving" },
    });
    expect([
      row.canEdit,
      row.canInvite,
      row.canRegister,
      row.canVote,
      row.canConfirm,
      row.canReplan,
      row.canFinalize,
    ]).toEqual(Array(7).fill(false));
    expect(row).not.toHaveProperty("confirmed");
    expect(row).not.toHaveProperty("endsAt");
    expect(row).not.toHaveProperty("bookingClosesAt");
    const noCid = eventCreationRecord(
      { ...intent, variables: { ...intent.variables, clientRequestId: undefined } },
      "owner",
    );
    expect(noCid.id).toBe("optimistic:10");
  });
  it("retains known grouped schedule and ignores mismatched group metadata", () => {
    const variables = {
      ...intent.variables,
      groupId,
      endsAt: "2030-06-03T21:00:00Z",
      bookingClosesAt: "2030-06-02T18:00:00Z",
      clientGroup: { id: groupId, name: "Club group", type: "PUBLIC" as const },
    };
    expect(eventCreationRecord({ ...intent, variables }, "owner")).toMatchObject({
      groupId,
      groupName: "Club group",
      groupType: "PUBLIC",
      endsAt: variables.endsAt,
      bookingClosesAt: variables.bookingClosesAt,
    });
    expect(
      eventCreationRecord(
        {
          ...intent,
          variables: { ...variables, clientGroup: { ...variables.clientGroup, id: cid } },
        },
        "owner",
      ).groupName,
    ).toBeNull();
  });
  it("uses a real ACK unchanged, retaining only client workflow status while the list reconciles", () => {
    const { optimistic: _client, ...base } = eventCreationRecord(intent, "owner");
    const receipt: PlannedEventResponse = {
      ...base,
      id: groupId,
      name: "Canonical name",
      canEdit: true,
      version: 2,
    };
    expect(eventCreationRecord({ ...intent, context: { receipt } }, "owner")).toEqual({
      ...receipt,
      optimistic: { draftId: "10", phase: "saving" },
    });
  });
  it("honors list source scope, text, selected periods and venue-local public day boundaries", () => {
    const row = eventCreationRecord(intent, "owner");
    expect(eventCreationMatches(row, {})).toBe(true);
    expect(eventCreationMatches(row, { groupId })).toBe(false);
    expect(eventCreationMatches(row, { query: " FRIDAY " })).toBe(true);
    expect(eventCreationMatches(row, { query: "Other" })).toBe(false);
    expect(eventCreationMatches(row, { periods: [] })).toBe(false);
    expect(eventCreationMatches(row, { periods: ["past"] })).toBe(true);
    expect(eventCreationMatches(row, { periods: ["future"] })).toBe(true);
    const publicRow: PlannedEventResponse = { ...row, groupId, groupType: "PUBLIC" };
    const now = Date.parse("2030-06-02T22:30:00Z");
    expect(eventCreationMatches(publicRow, { groupId, periods: ["future"] }, now)).toBe(true);
    expect(eventCreationMatches(publicRow, { periods: ["past"] }, now)).toBe(false);
    const past = { ...publicRow, dates: [{ id: cid, day: "2030-06-02" }] };
    expect(eventCreationMatches(past, { periods: ["past"] }, now)).toBe(true);
    expect(eventCreationMatches(past, { periods: ["future"] }, now)).toBe(false);
    expect(eventCreationMatches(past, { periods: ["past", "future"] }, now)).toBe(true);
  });
  it("uses the confirmed chosen PRIVATE day after a concurrent lifecycle receipt, never a guessed option", () => {
    const row: PlannedEventResponse = {
      ...eventCreationRecord(intent, "owner"),
      groupId,
      groupType: "PRIVATE",
      status: "CONFIRMED",
      confirmed: { dateId: cid, locationId: cid, at: "2030-06-01T12:00:00Z" },
    };
    const now = Date.parse("2030-06-04T12:00:00Z");
    expect(eventCreationMatches(row, { periods: ["past"] }, now)).toBe(true);
    expect(eventCreationMatches(row, { periods: ["future"] }, now)).toBe(false);
    expect(
      eventCreationMatches({ ...row, confirmed: undefined }, { periods: ["future"] }, now),
    ).toBe(true);
    expect(
      eventCreationMatches(
        {
          ...row,
          confirmed: {
            ...(row.confirmed as NonNullable<PlannedEventResponse["confirmed"]>),
            dateId: groupId,
          },
        },
        { periods: ["past"] },
        now,
      ),
    ).toBe(true);
  });
});
