import { z } from "zod";
import { clientRequestIdSchema, targetUserIdSchema } from "../../common/dto/common";
import { verifiedLocationSchema } from "../../locations/models/locations";
import { resultsSchema, scoreSchema, tieBreakSchema } from "../../ratings/models/results";

export const eventStateSchema = z.enum(["PLANNING", "CONFIRMED", "TERMINATED"]);
export const eventVoteSchema = z.enum(["UNKNOWN", "YES", "NO", "IF_NEEDED"]);
export type EventVote = z.infer<typeof eventVoteSchema>;
export const eventTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const MAX_EVENT_OPTIONS = 20;
/** Old records inherit the Event clock; new proposals may carry their own local time. */
export const eventDateOptionSchema = z
  .object({ id: z.uuid(), day: z.iso.date(), startTime: eventTimeSchema.optional() })
  .strict();
export const eventRecordSchema = z
  .object({
    id: z.uuid(),
    clientRequestId: clientRequestIdSchema.optional(),
    groupId: z.uuid().nullable(),
    visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
    /** Captured only by atomic finalization, never edited or revoked afterward. */
    shareResultsWithFriends: z.boolean().optional(),
    adminUserId: targetUserIdSchema,
    name: z.string().trim().min(5).max(120),
    timeZone: z.string().min(1).max(100),
    startTime: eventTimeSchema,
    endsAt: z.iso.datetime({ offset: true }).optional(),
    bookingClosesAt: z.iso.datetime({ offset: true }).optional(),
    dates: z.array(eventDateOptionSchema).min(1),
    locations: z.array(verifiedLocationSchema).min(1),
    status: eventStateSchema,
    version: z.number().int().positive(),
    planningGeneration: z.number().int().positive(),
    allowParticipantDates: z.boolean().optional(),
    allowParticipantLocations: z.boolean().optional(),
    nextPriority: z.number().int().nonnegative(),
    nextTableOrder: z.number().int().nonnegative(),
    lastNotifiedSituation: z.string().optional(),
    confirmed: z
      .object({ dateId: z.uuid(), locationId: z.uuid(), at: z.iso.datetime({ offset: true }) })
      .strict()
      .optional(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type EventRecord = z.infer<typeof eventRecordSchema>;
export const tableGameOptionSchema = z
  .object({
    gameId: z.number().int().positive(),
    /** Authoritative BGG duration or an explicit manual fallback, captured on save. */
    durationMinutes: z.number().int().positive().optional(),
    durationSource: z.enum(["BGG", "MANUAL"]).optional(),
  })
  .strict();
// Provisional scores never populate immutable results or rating/statistics readers.
export const tableResultDraftSchema = z
  .object({
    lowerWins: z.boolean(),
    entries: z
      .array(z.object({ userId: targetUserIdSchema, score: scoreSchema.nullable() }).strict())
      .min(1),
    tieBreaks: z.array(tieBreakSchema),
  })
  .strict();
export const tableRecordSchema = z
  .object({
    id: z.uuid(),
    eventId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    order: z.number().int().nonnegative(),
    minPlayers: z.number().int().min(2),
    maxPlayers: z.number().int().min(2),
    games: z.array(tableGameOptionSchema).min(1),
    rankingEnabled: z.boolean(),
    allowParticipantGames: z.boolean().optional(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    demonstratorUserId: targetUserIdSchema.optional(),
    confirmed: z
      .object({
        gameId: z.number().int().positive(),
        playerIds: z.array(targetUserIdSchema).min(2),
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }).optional(),
      })
      .strict()
      .optional(),
    resultDraft: tableResultDraftSchema.optional(),
    results: resultsSchema.optional(),
    removedAt: z.iso.datetime({ offset: true }).optional(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type TableRecord = z.infer<typeof tableRecordSchema>;
export const tableRegistrationSchema = z
  .object({
    id: z.uuid(),
    eventId: z.uuid(),
    tableId: z.uuid(),
    userId: targetUserIdSchema,
    kind: z.enum(["INVITATION", "SELF"]),
    status: z.enum(["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"]),
    priorityAt: z.iso.datetime({ offset: true }),
    sequence: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    gameVotes: z.record(z.string(), eventVoteSchema),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type TableRegistration = z.infer<typeof tableRegistrationSchema>;
export const eventVoterSchema = z
  .object({
    eventId: z.uuid(),
    userId: targetUserIdSchema,
    dateVotes: z.record(z.string(), eventVoteSchema),
    locationVotes: z.record(z.string(), eventVoteSchema),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type EventVoter = z.infer<typeof eventVoterSchema>;

export const EVENT_RECORD_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { adminUserId: 1, createdAt: -1, id: -1 } },
  { key: { groupId: 1, createdAt: -1, id: -1 } },
] as const;
export const TABLE_RECORD_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { "results.entries.userId": 1, "confirmed.gameId": 1 } },
  {
    key: { eventId: 1, order: 1 },
    unique: true,
    partialFilterExpression: { order: { $exists: true } },
  },
] as const;
export const TABLE_REGISTRATION_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { tableId: 1, userId: 1 }, unique: true },
  { key: { eventId: 1, userId: 1, status: 1 } },
  { key: { tableId: 1, priorityAt: 1, sequence: 1 } },
] as const;
export const EVENT_VOTER_INDEXES = [{ key: { eventId: 1, userId: 1 }, unique: true }] as const;
