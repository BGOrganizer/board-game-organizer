import { describe, expect, it } from "vitest";
import {
  eventProposalPayloadSchema,
  reviewEventProposalSchema,
  submitEventProposalSchema,
} from "../../index";

const id = "11111111-1111-4111-8111-111111111111";
const payload = { kind: "date", day: "2030-06-04", startTime: "20:30" };
describe("private participant proposal boundaries", () => {
  it("requires exact version/correlation/payload, not role, votes, status or client canonical identity", () => {
    const input = { eventVersion: 1, clientRequestId: id, payload };
    expect(submitEventProposalSchema.parse(input)).toEqual(input);
    for (const invalid of [
      { ...input, eventVersion: 0 },
      { ...input, clientRequestId: "arbitrary" },
      { ...input, role: "admin" },
      { ...input, status: "ACCEPTED" },
      { ...input, payload: { ...payload, id } },
      { ...input, payload: { ...payload, day: "2030-02-30" } },
      { ...input, payload: { ...payload, startTime: "24:00" } },
      { ...input, payload: { ...payload, votes: { yes: true } } },
    ])
      expect(submitEventProposalSchema.safeParse(invalid).success).toBe(false);
  });
  it("targets only explicit Table/game IDs or structured verified-address candidates", () => {
    expect(eventProposalPayloadSchema.parse({ kind: "game", tableId: id, gameId: 42 })).toEqual({
      kind: "game",
      tableId: id,
      gameId: 42,
    });
    expect(
      eventProposalPayloadSchema.safeParse({ kind: "game", tableId: "wrong", gameId: 0 }).success,
    ).toBe(false);
    expect(
      eventProposalPayloadSchema.safeParse({ kind: "location", location: "unverified input" })
        .success,
    ).toBe(false);
    const location = {
      id,
      name: "Club",
      address: "Via Roma 1",
      latitude: 41.9,
      longitude: 12.5,
      timeZone: "Europe/Rome",
    };
    expect(eventProposalPayloadSchema.parse({ kind: "location", location })).toEqual({
      kind: "location",
      location,
    });
  });
  it("accepts only versioned accept/reject decisions, never configuration or ratings", () => {
    for (const action of ["accept", "reject"])
      expect(reviewEventProposalSchema.parse({ action, eventVersion: 2, version: 1 })).toEqual({
        action,
        eventVersion: 2,
        version: 1,
      });
    for (const invalid of [
      { action: "cancel", eventVersion: 2, version: 1 },
      { action: "accept", eventVersion: 0, version: 1 },
      { action: "accept", eventVersion: 2, version: 0 },
      { action: "accept", eventVersion: 2, version: 1, canonicalOptionId: id },
      { action: "accept", eventVersion: 2, version: 1, rating: 9 },
    ])
      expect(reviewEventProposalSchema.safeParse(invalid).success).toBe(false);
  });
});
