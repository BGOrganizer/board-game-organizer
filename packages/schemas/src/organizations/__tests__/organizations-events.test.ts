import { describe, expect, it } from "vitest";
import {
  eventBookingActionSchema,
  eventModel,
  eventTableInputSchema,
  inviteEventPlayerSchema,
  inviteOrganizationMemberSchema,
  organizationAssetModel,
  organizationEmptyActionSchema,
  organizationMembershipActionSchema,
  organizationMembershipModel,
  organizationModel,
  reviewOrganizationSchema,
  saveEventSchema,
  saveOrganizationSchema,
  startOrganizationLogoSchema,
  updateEventSchema,
  updateOrganizationSchema,
  uploadOrganizationLogoChunkSchema,
} from "../../index";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const location = {
  id,
  name: "Club venue",
  address: "Via Roma 1, Roma, Italia",
  longitude: 12.5,
  latitude: 41.9,
};
const revision = { name: "Board club", logoAssetId: id, location };
const table = {
  name: "First table",
  startsAt: "2027-04-11T09:00:00Z",
  endsAt: "2027-04-11T11:00:00Z",
  minPlayers: 2,
  maxPlayers: 6,
  gameId: 1,
  openSkill: false,
};
const event = {
  name: "Sunday event",
  timeZone: "Europe/Rome",
  startsAt: "2027-04-11T08:00:00Z",
  endsAt: "2027-04-11T18:00:00Z",
  bookingClosesAt: "2027-04-10T08:00:00Z",
  location,
  status: "PUBLISHED" as const,
  tables: [table],
};

describe("organization validation", () => {
  it("requires explicit revision on edits without allowing missing creation tables", () => {
    expect(updateOrganizationSchema.parse({ ...revision, version: 1 }).version).toBe(1);
    expect(updateOrganizationSchema.safeParse(revision).success).toBe(false);
    expect(updateEventSchema.safeParse({ ...event, version: 1, tables: [] }).success).toBe(true);
    expect(saveEventSchema.safeParse({ ...event, tables: [] }).success).toBe(false);
    expect(updateEventSchema.parse({ ...event, version: 1 }).removedTableIds).toEqual([]);
    expect(
      updateEventSchema.safeParse({ ...event, version: 1, removedTableIds: [id, id] }).success,
    ).toBe(false);
    expect(
      updateEventSchema.safeParse({
        ...event,
        version: 1,
        tables: [{ ...table, id }],
        removedTableIds: [id],
      }).success,
    ).toBe(false);
    expect(
      updateEventSchema.safeParse({
        ...event,
        version: 1,
        tables: [{ ...table, id }],
        removedTableIds: [otherId],
      }).success,
    ).toBe(true);
  });
  it("accepts mandatory normalized-length fields and no client authority", () => {
    expect(saveOrganizationSchema.parse({ ...revision, name: "  Board club  " }).name).toBe(
      "Board club",
    );
    for (const value of [
      { ...revision, name: "four" },
      { ...revision, name: "x".repeat(121) },
      { ...revision, logoAssetId: "invalid" },
      { ...revision, location: { ...location, latitude: 100 } },
      { ...revision, adminUserId: "attacker" },
      { ...revision, status: "CREATED" },
      { ...revision, logoAssetId: undefined },
      { ...revision, location: undefined },
    ])
      expect(saveOrganizationSchema.safeParse(value).success).toBe(false);
  });
  it("requires proposal version and nonempty rejection reason", () => {
    expect(reviewOrganizationSchema.parse({ decision: "approve", version: 1 }).decision).toBe(
      "approve",
    );
    expect(
      reviewOrganizationSchema.parse({
        decision: "reject",
        version: 2,
        reason: "  Address missing  ",
      }),
    ).toMatchObject({ reason: "Address missing" });
    for (const value of [
      { decision: "reject", version: 1, reason: " " },
      { decision: "approve", version: 0 },
      { decision: "approve", version: 1, admin: true },
      { decision: "approve", version: 1, reason: "extra" },
    ])
      expect(reviewOrganizationSchema.safeParse(value).success).toBe(false);
  });
  it("validates bounded uploads below provider request limits", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(startOrganizationLogoSchema.parse({ mimeType, byteLength: 5_000_000 }).mimeType).toBe(
        mimeType,
      );
    }
    for (const value of [
      { mimeType: "image/svg+xml", byteLength: 10 },
      { mimeType: "image/png", byteLength: 0 },
      { mimeType: "image/png", byteLength: 5_000_001 },
      { mimeType: "image/png", byteLength: 1.5 },
    ])
      expect(startOrganizationLogoSchema.safeParse(value).success).toBe(false);
    for (const base64 of ["YWJj", "YWI=", "YQ=="]) {
      expect(uploadOrganizationLogoChunkSchema.parse({ offset: 0, base64 }).base64).toBe(base64);
    }
    for (const value of [
      { offset: -1, base64: "YWJj" },
      { offset: 0, base64: "!!!!" },
      { offset: 0, base64: "YQ=" },
      { offset: 0, base64: "YQ==junk" },
      { offset: 0, base64: "" },
      { offset: 0, base64: "A".repeat(341_340) },
      { offset: 0, base64: "YWJj", ownerUserId: "x" },
    ])
      expect(uploadOrganizationLogoChunkSchema.safeParse(value).success).toBe(false);
  });
  it("validates membership bodies without allowing client role assignment", () => {
    expect(inviteOrganizationMemberSchema.parse({ userId: "user_member" }).userId).toBe(
      "user_member",
    );
    for (const action of [
      "accept",
      "decline",
      "approve",
      "reject",
      "cancel",
      "remove",
      "ban",
      "revoke",
    ]) {
      expect(organizationMembershipActionSchema.parse({ action }).action).toBe(action);
    }
    expect(
      organizationMembershipActionSchema.safeParse({ action: "accept", role: "admin" }).success,
    ).toBe(false);
    expect(organizationEmptyActionSchema.parse({})).toEqual({});
    expect(organizationEmptyActionSchema.safeParse({ userId: "other" }).success).toBe(false);
  });
  it("represents private proposals, approved revisions, exclusions and expiring assets", () => {
    const now = "2027-04-01T08:00:00Z";
    expect(
      organizationModel.parse({
        id,
        adminUserId: "user_owner",
        status: "MODIFIED",
        approved: revision,
        proposal: { ...revision, name: "Changed club" },
        reservedNames: ["board club", "changed club"],
        reviewStatus: "REJECTED",
        rejectionReason: "Review again",
        version: 2,
        createdAt: now,
        updatedAt: now,
      }).approved?.name,
    ).toBe("Board club");
    expect(
      organizationMembershipModel.parse({
        id,
        organizationId: otherId,
        userId: "user_member",
        kind: "REQUEST",
        status: "EXCLUDED",
        excludedReason: "BANNED",
        createdAt: now,
        updatedAt: now,
      }).excludedReason,
    ).toBe("BANNED");
    expect(
      organizationAssetModel.parse({
        id,
        ownerUserId: "user_owner",
        mimeType: "image/png",
        byteLength: 3,
        receivedBytes: 0,
        status: "UPLOADING",
        base64: "",
        createdAt: now,
        expiresAt: new Date(now),
      }).expiresAt,
    ).toBeInstanceOf(Date);
  });
});

describe("event validation", () => {
  it("accepts published events and empty complete drafts", () => {
    expect(saveEventSchema.parse(event).tables).toHaveLength(1);
    expect(saveEventSchema.parse({ ...event, status: "DRAFT", tables: [] }).status).toBe("DRAFT");
    expect(
      eventModel.parse({
        ...event,
        id,
        organizationId: otherId,
        adminUserId: "user_owner",
        version: 1,
        createdAt: "2027-04-01T00:00:00Z",
        updatedAt: "2027-04-01T00:00:00Z",
      }).id,
    ).toBe(id);
  });
  it("checks local event day, including UTC day changes and DST", () => {
    expect(
      saveEventSchema.safeParse({
        ...event,
        tables: [],
        status: "DRAFT",
        startsAt: "2027-04-11T22:30:00Z",
        endsAt: "2027-04-12T01:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      saveEventSchema.safeParse({
        ...event,
        tables: [],
        status: "DRAFT",
        startsAt: "2027-04-11T21:30:00Z",
        endsAt: "2027-04-11T22:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      saveEventSchema.safeParse({
        ...event,
        tables: [],
        status: "DRAFT",
        startsAt: "2027-10-31T00:30:00Z",
        endsAt: "2027-10-31T02:30:00Z",
      }).success,
    ).toBe(true);
  });
  it("rejects invalid times, missing tables, duplicate ids and uncontained intervals", () => {
    for (const value of [
      { ...event, endsAt: event.startsAt },
      { ...event, endsAt: "2027-04-11T07:00:00Z" },
      { ...event, bookingClosesAt: event.startsAt },
      { ...event, bookingClosesAt: event.endsAt },
      { ...event, timeZone: "Invalid/Zone" },
      { ...event, startsAt: "not-a-date" },
      { ...event, tables: [] },
      { ...event, tables: [{ ...table, startsAt: "2027-04-11T07:00:00Z" }] },
      { ...event, tables: [{ ...table, endsAt: "2027-04-11T19:00:00Z" }] },
      {
        ...event,
        tables: [
          { ...table, id },
          { ...table, id },
        ],
      },
      { ...event, tables: [{ ...table, maxPlayers: 1 }] },
      { ...event, status: "CANCELLED" },
      { ...event, adminUserId: "attacker" },
    ])
      expect(saveEventSchema.safeParse(value).success).toBe(false);
    expect(
      saveEventSchema.parse({
        ...event,
        tables: [
          { ...table, id },
          { ...table, id: otherId },
        ],
      }).tables,
    ).toHaveLength(2);
  });
  it("does not impose an arbitrary table-count ceiling", () => {
    expect(
      saveEventSchema.parse({ ...event, tables: Array.from({ length: 250 }, () => table) }).tables,
    ).toHaveLength(250);
  });
  it("validates every table edit field and booking action", () => {
    expect(
      eventTableInputSchema.parse({ ...table, demonstratorUserId: "user_demo", openSkill: true })
        .openSkill,
    ).toBe(true);
    for (const value of [
      { ...table, endsAt: table.startsAt },
      { ...table, minPlayers: 1 },
      { ...table, minPlayers: 3, maxPlayers: 2 },
      { ...table, name: " " },
      { ...table, gameId: 0 },
      { ...table, demonstratorUserId: "" },
      { ...table, status: "CREATED" },
    ])
      expect(eventTableInputSchema.safeParse(value).success).toBe(false);
    expect(inviteEventPlayerSchema.parse({ userId: "user_member" }).userId).toBe("user_member");
    for (const action of ["accept", "decline", "approve", "reject", "cancel", "remove"]) {
      expect(eventBookingActionSchema.parse({ action }).action).toBe(action);
    }
    expect(eventBookingActionSchema.safeParse({ action: "approve", userId: "other" }).success).toBe(
      false,
    );
  });
});
