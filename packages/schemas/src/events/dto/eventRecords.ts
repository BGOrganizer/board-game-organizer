import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";
import type { BggSearchItem } from "../../games/dto/boardGames";
import { verifiedLocationSchema } from "../../locations/models/locations";
import type { MatchGameRating } from "../../matches/dto/matches";
import { scoreSchema, tieBreakSchema } from "../../ratings/models/results";
import {
  type EventRecord,
  type EventVoter,
  eventTimeSchema,
  eventVoteSchema,
  type TableRecord,
  type TableRegistration,
} from "../models/eventRecord";

const zoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, "Invalid time zone");
const gameInputSchema = z
  .object({
    gameId: z.number().int().positive(),
    manualDurationMinutes: z.number().int().positive().optional(),
  })
  .strict();
export const plannedTableInputSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(120),
    minPlayers: z.number().int().min(2),
    maxPlayers: z.number().int().min(2),
    games: z
      .array(gameInputSchema)
      .min(1)
      .refine(
        (games) => new Set(games.map((game) => game.gameId)).size === games.length,
        "Games must be unique",
      ),
    rankingEnabled: z.boolean(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    demonstratorUserId: targetUserIdSchema.optional(),
  })
  .strict()
  .refine((table) => table.maxPlayers > table.minPlayers, {
    path: ["maxPlayers"],
    message: "Maximum must be above minimum",
  });
export type PlannedTableInput = z.infer<typeof plannedTableInputSchema>;
export const createPlannedEventSchema = z
  .object({
    groupId: z.uuid().nullable(),
    name: z.string().trim().min(5).max(120),
    timeZone: zoneSchema,
    startTime: eventTimeSchema,
    endsAt: z.iso.datetime({ offset: true }).optional(),
    bookingClosesAt: z.iso.datetime({ offset: true }).optional(),
    dates: z.array(z.object({ id: z.uuid(), day: z.iso.date() }).strict()).length(1),
    locations: z.array(verifiedLocationSchema).length(1),
    tables: z
      .array(plannedTableInputSchema)
      .min(1)
      .max(20)
      .refine((tables) => {
        const ids = tables.flatMap((table) => (table.id ? [table.id] : []));
        return new Set(ids).size === ids.length;
      }, "Table IDs must be unique"),
  })
  .strict();
export type CreatePlannedEventInput = z.infer<typeof createPlannedEventSchema>;
export const editPlannedEventSchema = createPlannedEventSchema
  .omit({ groupId: true, tables: true })
  .extend({
    version: z.number().int().positive(),
    tables: z
      .array(plannedTableInputSchema)
      .max(20)
      .refine((rows) => {
        const ids = rows.flatMap((row) => (row.id ? [row.id] : []));
        return new Set(ids).size === ids.length;
      }, "Table IDs must be unique"),
    removedTableIds: z
      .array(z.uuid())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, "Removed table IDs must be unique"),
  })
  .strict();
export type EditPlannedEventInput = z.infer<typeof editPlannedEventSchema>;
export const changeEventStateSchema = z
  .object({ version: z.number().int().positive(), action: z.enum(["confirm", "replan"]) })
  .strict();
export type ChangeEventStateInput = z.infer<typeof changeEventStateSchema>;
export const changeEventVoteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("date"), optionId: z.uuid(), vote: eventVoteSchema }).strict(),
  z.object({ kind: z.literal("location"), optionId: z.uuid(), vote: eventVoteSchema }).strict(),
  z
    .object({
      kind: z.literal("game"),
      tableId: z.uuid(),
      gameId: z.number().int().positive(),
      vote: eventVoteSchema,
    })
    .strict(),
]);
export type ChangeEventVoteInput = z.infer<typeof changeEventVoteSchema>;
export const inviteTablePlayerSchema = z.object({ userId: targetUserIdSchema }).strict();
export const decideTableRegistrationSchema = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(["accept", "decline", "cancel", "remove"]),
  })
  .strict();
export type DecideTableRegistrationInput = z.infer<typeof decideTableRegistrationSchema>;
export const tableResultsInputSchema = z
  .object({
    tableId: z.uuid(),
    lowerWins: z.boolean(),
    entries: z
      .array(z.object({ userId: targetUserIdSchema, score: scoreSchema.nullable() }).strict())
      .min(1),
    tieBreaks: z.array(tieBreakSchema),
  })
  .strict();
export type TableResultsInput = z.infer<typeof tableResultsInputSchema>;
export const finalizeEventSchema = z
  .object({
    version: z.number().int().positive(),
    results: z.array(tableResultsInputSchema).min(1).max(20),
  })
  .strict();
export type FinalizeEventInput = z.infer<typeof finalizeEventSchema>;
export interface PlannedEventCapabilities {
  canEdit: boolean;
  canInvite: boolean;
  canRegister: boolean;
  canVote: boolean;
  canConfirm: boolean;
  canReplan: boolean;
  canFinalize: boolean;
}
export type PlannedEventResponse = Omit<
  EventRecord,
  "lastNotifiedSituation" | "nextPriority" | "nextTableOrder"
> &
  PlannedEventCapabilities & {
    groupName: string | null;
    groupType: "PRIVATE" | "PUBLIC" | null;
    role: "admin" | "participant" | "invited" | "member" | "demonstrator";
    myRegistrations: TableRegistration[];
    myVotes?: Pick<EventVoter, "dateVotes" | "locationVotes">;
    agreement?: {
      agreed: boolean;
      dateId?: string;
      locationId?: string;
      tables: Array<{ tableId: string; gameId: number; participantIds: string[] }>;
      reasons: Array<{ tableId: string; code: string }>;
    };
    tableCount: number;
    participantCount: number;
  };
export type TableSeatPosition = "SEATED" | "WAITING" | "FROZEN";
export type PlannedTableResponse = TableRecord & {
  eventName: string;
  demonstratorName?: string | null;
  bookingClosesAt?: string;
  groupId: string | null;
  groupType: "PRIVATE" | "PUBLIC" | null;
  eventStatus: EventRecord["status"];
  adminUserId: string;
  myRegistration: TableRegistration | null;
  myPosition: TableSeatPosition | null;
  seatedCount: number;
  waitingCount: number;
  pendingCount: number;
  canRegister: boolean;
  canRespond: boolean;
  canLeave: boolean;
  canInvite: boolean;
  gamesDetail: BggSearchItem[];
  ratingChanges: MatchGameRating[];
  winners?: Array<{ userId: string; name: string; avatarUrl: string | null }>;
  resultProfiles?: Array<{
    userId: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  }>;
  groupRatingChanges?: MatchGameRating[];
};
export type TableSeatResponse = TableRegistration & {
  email?: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  position: TableSeatPosition;
};
