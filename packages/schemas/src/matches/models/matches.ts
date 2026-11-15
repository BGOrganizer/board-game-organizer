import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";
import { verifiedLocationSchema as matchLocationSchema } from "../../locations/models/locations";
import { resultsSchema as matchResultsSchema } from "../../ratings/models/results";

export type { BoardGame, BoardGameCsv } from "../../games/models/boardGames";
// Transitional exports keep existing callers working until the event/table cutover.
export { boardGameCsvModel, boardGameModel } from "../../games/models/boardGames";
export type { VerifiedLocation as MatchLocation } from "../../locations/models/locations";
export { verifiedLocationSchema as matchLocationSchema } from "../../locations/models/locations";
export type { TableResults as MatchResults } from "../../ratings/models/results";
export {
  resultEntrySchema as matchResultEntrySchema,
  resultsSchema as matchResultsSchema,
  scoreSchema as matchScoreSchema,
  tieBreakSchema as matchTieBreakSchema,
} from "../../ratings/models/results";

export const matchStatusSchema = z.enum(["PLANNING", "CREATED", "TERMINATED"]);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const matchInvitationStatusSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED"]);
export type MatchInvitationStatus = z.infer<typeof matchInvitationStatusSchema>;

export const matchChoiceSchema = z.enum(["UNKNOWN", "YES", "NO", "IF_NEEDED"]);
export type MatchChoice = z.infer<typeof matchChoiceSchema>;

export const matchChoicesSchema = z.object({
  dates: z.record(z.string(), matchChoiceSchema).optional(),
  games: z.record(z.string(), matchChoiceSchema).optional(),
  locations: z.record(z.string(), matchChoiceSchema).optional(),
});

export const matchEventTableSchema = z.object({
  organizationId: z.uuid(),
  eventId: z.uuid(),
  tableId: z.uuid(),
  eventName: z.string(),
  tableName: z.string(),
  demonstratorUserId: targetUserIdSchema.optional(),
  openSkill: z.boolean(),
  bookingClosesAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
});

/** Match persisted independently from invitation lifecycle. */
export const matchModel = z.object({
  id: z.uuid(),
  /** Match administrator and creator (Clerk user ID). */
  clerkId: targetUserIdSchema,
  name: z.string().min(5).max(120),
  dates: z.array(z.iso.datetime({ offset: true })).min(1),
  locations: z.array(matchLocationSchema).optional(), // Older matches have no locations.
  minPlayers: z.number().int().min(2),
  maxPlayers: z.number().int().min(2),
  gameIds: z.array(z.number().int().positive()).min(1),
  groupId: z.uuid().optional(),
  eventTable: matchEventTableSchema.optional(),
  isPublic: z.boolean().optional(), // Legacy matches are private.
  choices: z.record(z.string(), matchChoicesSchema).optional(),
  status: matchStatusSchema,
  selectedDate: z.iso.datetime({ offset: true }).optional(),
  selectedLocationId: z.uuid().optional(),
  selectedGameId: z.number().int().positive().optional(),
  results: matchResultsSchema.optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Match = z.infer<typeof matchModel>;

/** Invitation persisted in `matchInvitations`; accepted invitations are participants. */
export const matchInvitationModel = z.object({
  id: z.uuid(),
  matchId: z.uuid(),
  inviterUserId: targetUserIdSchema,
  inviteeUserId: targetUserIdSchema,
  status: matchInvitationStatusSchema,
  kind: z.enum(["INVITATION", "REQUEST"]).optional(), // Legacy records are invitations.
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  respondedAt: z.iso.datetime({ offset: true }).optional(),
});
export type MatchInvitation = z.infer<typeof matchInvitationModel>;

export const MATCH_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { clerkId: 1, createdAt: -1 } },
  { key: { groupId: 1, status: 1, selectedGameId: 1 } },
  { key: { status: 1, selectedGameId: 1 } },
  {
    key: { "eventTable.tableId": 1 },
    unique: true,
    partialFilterExpression: { "eventTable.tableId": { $exists: true } },
  },
] as const;

function hasDuplicates(values: readonly unknown[]) {
  return new Set(values).size !== values.length;
}

export const MATCH_INVITATION_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { matchId: 1, inviteeUserId: 1 }, unique: true },
  { key: { inviteeUserId: 1, status: 1, createdAt: -1 } },
] as const;

/** Request body for creating a match. Server always assigns `PLANNING`. */
export const createMatchSchema = z
  .object({
    name: z.string().trim().min(5, "Name must be at least 5 characters").max(120),
    dates: z.array(z.iso.datetime({ offset: true })).min(1, "At least one date is required"),
    locations: z
      .array(matchLocationSchema)
      .min(1, "At least one location is required")
      .refine(
        (locations) => new Set(locations.map((location) => location.id)).size === locations.length,
      ),
    minPlayers: z.number().int().min(2, "Minimum players must be at least 2"),
    maxPlayers: z.number().int().min(2),
    invitedUserIds: z.array(targetUserIdSchema).default([]),
    gameIds: z.array(z.number().int().positive()).min(1, "At least one game is required"),
    groupId: z.uuid().optional(),
    isPublic: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.groupId && value.isPublic) {
      context.addIssue({
        code: "custom",
        path: ["isPublic"],
        message: "Group matches must be private",
      });
    }
    if (value.maxPlayers < value.minPlayers) {
      context.addIssue({
        code: "custom",
        path: ["maxPlayers"],
        message: "Maximum players must be greater than or equal to minimum players",
      });
    }
    if (value.invitedUserIds.length > value.maxPlayers - 1) {
      context.addIssue({
        code: "custom",
        path: ["invitedUserIds"],
        message: "Invitations exceed available player positions",
      });
    }
    for (const [field, values] of [
      ["dates", value.dates],
      ["invitedUserIds", value.invitedUserIds],
      ["gameIds", value.gameIds],
    ] as const) {
      if (hasDuplicates(values)) {
        context.addIssue({ code: "custom", path: [field], message: `${field} must be unique` });
      }
    }
  });
export type CreateMatchInput = z.infer<typeof createMatchSchema>;
