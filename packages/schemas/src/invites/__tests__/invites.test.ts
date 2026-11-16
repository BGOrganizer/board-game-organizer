import { expect, it } from "vitest";
import {
  claimInviteParamsSchema,
  createInviteParamsSchema,
  inviteClaimResponseSchema,
  inviteResultSchema,
} from "../dto/invites";
import { INVITE_INDEXES, INVITE_TTL_DAYS } from "../models/invites";

const id = "11111111-1111-4111-8111-111111111111";
it("preserves legacy friendship create/claim bodies and seven-day tokens", () => {
  expect(createInviteParamsSchema.parse({})).toEqual({});
  expect(
    createInviteParamsSchema.parse({
      email: "friend@example.test",
      webOrigin: "https://preview.example.test",
    }),
  ).toEqual({ email: "friend@example.test", webOrigin: "https://preview.example.test" });
  expect(claimInviteParamsSchema.parse({ token: "valid-token" })).toEqual({ token: "valid-token" });
  expect(INVITE_TTL_DAYS).toBe(7);
  expect(INVITE_INDEXES[0]).toEqual({ key: { token: 1 }, unique: true });
});
it("accepts a UUID Table context with explicit combined consent and canonical participation", () => {
  expect(createInviteParamsSchema.parse({ tableId: id })).toEqual({ tableId: id });
  const input = {
    token: "valid-token",
    consent: true,
    participation: {
      version: 3,
      gameVotes: {},
      availability: { version: 3, dateVotes: {}, locationVotes: {} },
    },
  };
  expect(claimInviteParamsSchema.parse(input)).toEqual(input);
});
it.each(["", "table", 42, null])("rejects invalid contextual Table identifier %s", (tableId) => {
  expect(createInviteParamsSchema.safeParse({ tableId }).success).toBe(false);
});
it.each([
  { token: "short" },
  { token: "valid-token", consent: false },
  { token: "valid-token", consent: "yes" },
  { token: "valid-token", participation: {} },
  { token: "valid-token", participation: { version: 1, gameVotes: { "1": "UNKNOWN" } } },
])("rejects malformed consent or incomplete/invalid choices", (input) => {
  expect(claimInviteParamsSchema.safeParse(input).success).toBe(false);
});
it("retains the legacy internal result schema", () => {
  const value = {
    token: "token",
    link: "https://example.test/invite/token",
    email: null,
    expiresAt: new Date(),
  };
  expect(inviteResultSchema.parse(value)).toEqual(value);
});
it("validates legacy and contextual success acknowledgments at runtime", () => {
  expect(inviteClaimResponseSchema.parse({ success: true, inviter: null })).toEqual({
    success: true,
    inviter: null,
  });
  const inviter = {
    id: "user_inviter",
    name: "Inviter",
    email: "inviter@example.test",
    avatarUrl: null,
  };
  expect(inviteClaimResponseSchema.parse({ success: true, inviter })).toEqual({
    success: true,
    inviter,
  });
  const table = { groupId: id, eventId: id, tableId: id, position: "WAITING" };
  expect(inviteClaimResponseSchema.parse({ success: true, inviter: null, table })).toEqual({
    success: true,
    inviter: null,
    table,
  });
});
it.each([
  { success: false, inviter: null },
  { success: true },
  { success: true, inviter: {} },
  { success: true, inviter: null, table: {} },
  {
    success: true,
    inviter: null,
    table: { groupId: "invalid", eventId: id, tableId: id, position: "SEATED" },
  },
  {
    success: true,
    inviter: null,
    table: { groupId: id, eventId: id, tableId: id, position: "UNKNOWN" },
  },
])("rejects malformed claim acknowledgment", (value) => {
  expect(inviteClaimResponseSchema.safeParse(value).success).toBe(false);
});
