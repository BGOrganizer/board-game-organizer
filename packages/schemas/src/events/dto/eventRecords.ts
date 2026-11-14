import { z } from "zod";
import { clientRequestIdSchema, targetUserIdSchema } from "../../common/dto/common";
import type { CommunityPageResponse } from "../../community/dto/communityResponses";
import type { BggSearchItem } from "../../games/dto/boardGames";
import { verifiedLocationSchema } from "../../locations/models/locations";
import type { MatchGameRating } from "../../matches/dto/matches";
import {
  type EventRecord,
  type EventVote,
  type EventVoter,
  eventDateOptionSchema,
  eventTimeSchema,
  eventVoteSchema,
  MAX_EVENT_OPTIONS,
  type TableRecord,
  type TableRegistration,
  tableRegistrationSchema,
  tableResultDraftSchema,
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
    allowParticipantGames: z.boolean().optional(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    demonstratorUserId: targetUserIdSchema.optional(),
  })
  .strict()
  .refine((table) => table.maxPlayers >= table.minPlayers, {
    path: ["maxPlayers"],
    message: "Maximum must not be below minimum",
  });
export type PlannedTableInput = z.infer<typeof plannedTableInputSchema>;
// Mutation receipt only: the parent epoch is captured in the same transaction, never stored on a registration.
export const tableRegistrationReceiptSchema = tableRegistrationSchema.extend({
  eventVersion: z.number().int().min(1),
});
export type TableRegistrationReceipt = z.infer<typeof tableRegistrationReceiptSchema>;
export const createPlannedEventSchema = z
  .object({
    groupId: z.uuid().nullable(),
    visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
    clientRequestId: clientRequestIdSchema.optional(),
    name: z.string().trim().min(5).max(120),
    timeZone: zoneSchema,
    planningMode: z.enum(["MANUAL", "ASSISTED"]).optional(),
    playerPreference: z.enum(["MORE_PLAYERS", "BEST"]).optional(),
    // Legacy callers may still send this field; Event writes derive it from playerPreference.
    allowBestReduction: z.boolean().optional(),
    allowParticipantDates: z.boolean().optional(),
    allowParticipantLocations: z.boolean().optional(),
    startTime: eventTimeSchema,
    endsAt: z.iso.datetime({ offset: true }).optional(),
    bookingClosesAt: z.iso.datetime({ offset: true }).optional(),
    dates: z
      .array(eventDateOptionSchema)
      .min(1)
      .max(MAX_EVENT_OPTIONS)
      .refine(
        (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
        "Date IDs must be unique",
      )
      .refine(
        (rows) =>
          new Set(rows.map((row) => `${row.day}T${row.startTime ?? ""}`)).size === rows.length,
        "Date/time options must be unique",
      ),
    locations: z
      .array(verifiedLocationSchema)
      .min(1)
      .max(MAX_EVENT_OPTIONS)
      .refine(
        (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
        "Location IDs must be unique",
      ),
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
  .omit({ groupId: true, tables: true, clientRequestId: true })
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
export const deletePlannedRecordSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export type DeletePlannedRecordInput = z.infer<typeof deletePlannedRecordSchema>;
export interface DeletedPlannedEventResponse {
  id: string;
  groupId: string | null;
}

export const changeEventStateSchema = z
  .object({ version: z.number().int().positive(), action: z.enum(["confirm", "replan"]) })
  .strict();
export type ChangeEventStateInput = z.infer<typeof changeEventStateSchema>;
export const eventAvailabilityVoteSchema = eventVoteSchema.exclude(["UNKNOWN"]);
export const joinEventAvailabilitySchema = z
  .object({
    version: z.number().int().positive(),
    dateVotes: z
      .record(z.uuid(), eventAvailabilityVoteSchema)
      .refine((value) => Object.keys(value).length <= MAX_EVENT_OPTIONS),
    locationVotes: z
      .record(z.uuid(), eventAvailabilityVoteSchema)
      .refine((value) => Object.keys(value).length <= MAX_EVENT_OPTIONS),
  })
  .strict();
export type JoinEventAvailability = z.infer<typeof joinEventAvailabilitySchema>;
export const joinTableSchema = z
  .object({
    version: z.number().int().positive(),
    gameVotes: z
      .record(
        z
          .string()
          .max(16)
          .regex(/^[1-9]\d*$/)
          .refine((value) => Number.isSafeInteger(Number(value))),
        eventAvailabilityVoteSchema,
      )
      .refine((value) => Object.keys(value).length <= MAX_EVENT_OPTIONS),
    availability: joinEventAvailabilitySchema.optional(),
  })
  .strict();
export type JoinTableInput = z.infer<typeof joinTableSchema>;
export const changeEventVoteSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("date"),
      optionId: z.uuid(),
      vote: eventAvailabilityVoteSchema,
      /** Legacy clients may send this validated cutoff; voting never acknowledges notices. */
      attentionThrough: z.iso.datetime({ precision: 3 }).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("location"),
      optionId: z.uuid(),
      vote: eventAvailabilityVoteSchema,
      attentionThrough: z.iso.datetime({ precision: 3 }).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("game"),
      tableId: z.uuid(),
      gameId: z.number().int().positive(),
      vote: eventAvailabilityVoteSchema,
      attentionThrough: z.iso.datetime({ precision: 3 }).optional(),
    })
    .strict(),
]);
export type ChangeEventVoteInput = z.infer<typeof changeEventVoteSchema>;
export const inviteTablePlayerSchema = z.object({ userId: targetUserIdSchema }).strict();
export const decideTableRegistrationSchema = z.discriminatedUnion("action", [
  z
    .object({
      version: z.number().int().positive(),
      action: z.literal("accept"),
      participation: joinTableSchema,
      attentionThrough: z.iso.datetime({ precision: 3 }).optional(),
    })
    .strict(),
  z
    .object({
      version: z.number().int().positive(),
      action: z.enum(["decline", "cancel", "remove"]),
      attentionThrough: z.iso.datetime({ precision: 3 }).optional(),
    })
    .strict(),
]);
export type DecideTableRegistrationInput = z.infer<typeof decideTableRegistrationSchema>;
export const tableResultsInputSchema = tableResultDraftSchema.extend({ tableId: z.uuid() });
export const saveTableResultSchema = tableResultDraftSchema.extend({
  version: z.number().int().positive(),
});
export type SaveTableResultInput = z.infer<typeof saveTableResultSchema>;
export const finalizeSavedEventSchema = z
  .object({
    version: z.number().int().positive(),
    shareResultsWithFriends: z.boolean().optional(),
  })
  .strict();
export type FinalizeSavedEventInput = z.infer<typeof finalizeSavedEventSchema>;
export type SaveTableResultResponse = { event: PlannedEventResponse; table: PlannedTableResponse };
export type TableResultsInput = z.infer<typeof tableResultsInputSchema>;
export const finalizeEventSchema = z
  .object({
    version: z.number().int().positive(),
    results: z.array(tableResultsInputSchema).min(1).max(20),
    shareResultsWithFriends: z.boolean().optional(),
  })
  .strict();
export type FinalizeEventInput = z.infer<typeof finalizeEventSchema>;
export type EventVoteCounts = Record<EventVote, number>;
export interface PlannedEventCapabilities {
  /** Safe Event/Table/result projection only; Group identity, drafts and rankings are absent. */
  sharedResultsOnly?: boolean;
  /** Frozen personal projection after a Group ban; no readable Group data or authority. */
  personalAccessOnly?: boolean;
  /** Opaque scope for purging revoked caches; never a Group link or capability. */
  accessRevokedGroupId?: string;
  /** Current server-authorized manager, not historical Event authorship. */
  canManage?: boolean;
  /** Display only: current Group administration/moderation or standalone ownership. */
  managementRole?: "admin" | "moderator" | null;
  canEdit: boolean;
  canInvite: boolean;
  canRegister: boolean;
  canVote: boolean;
  canConfirm: boolean;
  canReplan: boolean;
  canFinalize: boolean;
  /** Authoritative readiness; older cached responses require a detail refresh. */
  resultsReady?: boolean;
  canProposeDates?: boolean;
  canProposeLocations?: boolean;
}
export type PlannedEventResponse = Omit<
  EventRecord,
  "lastNotifiedSituation" | "nextPriority" | "nextTableOrder"
> &
  PlannedEventCapabilities & {
    groupName: string | null;
    groupType: "PRIVATE" | "PUBLIC" | null;
    role: "admin" | "participant" | "invited" | "member" | "demonstrator" | "viewer";
    readOnly?: boolean;
    /** Own source positions only; absent on older cache entries and incomplete mutation receipts. */
    myRegistrations: (TableRegistration & { position?: TableSeatPosition })[];
    /** Complete own duty projection, including when the viewer is also administrator. */
    myDemonstrator?: boolean;
    myVotes?: Pick<EventVoter, "dateVotes" | "locationVotes">;
    voteCounts?: {
      dates: Record<string, EventVoteCounts>;
      locations: Record<string, EventVoteCounts>;
    };
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
export type TableLeaderboardPlayer = {
  userId: string;
  name: string;
  username?: string | null;
  avatarUrl: string | null;
  score: number;
  provisional: boolean;
  gamesPlayed: number;
  gamesWon: number;
  nd: number;
  /** Scoped current ratings; optional only for older owned caches. */
  globalRating?: { score: number; provisional: boolean };
  groupRating?: { score: number; provisional: boolean };
};
export type TableInviteeResponse = {
  /** Missing only on cached responses predating invitation availability metadata. */
  invitationBlockReason?: "TABLE_TIME_CONFLICT" | null;
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
};
export type TableInviteesPageResponse = CommunityPageResponse<TableInviteeResponse> & {
  /** Missing only on cached responses predating candidate snapshot epochs. */
  eventVersion?: number;
};
export type TableLeaderboardResponse = {
  gameId: number;
  scope: "GLOBAL" | "GROUP";
  items: TableLeaderboardPlayer[];
  nextCursor: string | null;
};
export type TableSeatPosition = "SEATED" | "WAITING" | "FROZEN";
/** Authorized attendance, invitations and duty, deduplicated before source paging; never invented consent. */
export interface EventParticipantResponse {
  id: string;
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  position: TableSeatPosition | null;
  /** Older cached pages contained accepted/frozen attendance only. */
  accepted?: boolean;
  pendingInvitation?: boolean;
  waiting?: boolean;
  demonstrator?: boolean;
  canRemove: boolean;
  /** Display only: current Group authority, or the standalone Event creator. Older caches omit it. */
  managementRole?: "admin" | "moderator" | null;
  /** Event rosters expose removal only; banning belongs to the Group screen. */
  canBanGroup: boolean;
}
export type EventParticipantsResponse = CommunityPageResponse<EventParticipantResponse> & {
  eventVersion: number;
  groupId: string | null;
  status: EventRecord["status"];
};
/** Display-only parent metadata. A proposal preview never grants agreement or a Table seat. */
export type EventSchedulePreview = {
  localStartsAt: string | null;
  location: EventRecord["locations"][number] | null;
  dateCount: number;
  locationCount: number;
  /** Complete authorized options; absent on older cache entries. Frozen Events expose choices only. */
  dates?: Array<{ id: string; localStartsAt: string }>;
  locations?: EventRecord["locations"];
  timeZone?: string;
};
export type PlannedTableResponse = Omit<TableRecord, "seatOrderVersion"> & {
  /** Anonymous occupied slots, including undisclosed pending reservations; absent in older caches. */
  occupiedSeatIndices?: number[];
  sharedResultsOnly?: boolean;
  personalAccessOnly?: boolean;
  /** Opaque scope for purging revoked caches; never a Group link or capability. */
  accessRevokedGroupId?: string;
  canManage?: boolean;
  /** Display only: current Group authority (or standalone owner), never historical authorship. */
  managementRole?: "admin" | "moderator" | null;
  canProposeGames?: boolean;
  readOnly?: boolean;
  eventName: string;
  /** Parent epoch at this authorized Table read; absent on historical cache entries. */
  eventVersion?: number;
  /** Missing on older cached responses; no per-card parent requests are required. */
  eventSchedule?: EventSchedulePreview;
  /** Optional for cached responses predating the list metadata projection. */
  groupName?: string | null;
  acceptedCount?: number;
  pendingRegistrationCount?: number;
  demonstratorName?: string | null;
  demonstratorAvatarUrl?: string | null;
  bookingClosesAt?: string;
  groupId: string | null;
  groupType: "PRIVATE" | "PUBLIC" | null;
  eventStatus: EventRecord["status"];
  adminUserId: string;
  myRegistration:
    | (TableRegistration &
        Partial<Pick<TableSeatResponse, "name" | "email" | "username" | "avatarUrl">>)
    | null;
  myPosition: TableSeatPosition | null;
  seatedCount: number;
  waitingCount: number;
  pendingCount: number;
  canRegister: boolean;
  canRespond: boolean;
  canLeave: boolean;
  canInvite: boolean;
  gamesDetail: BggSearchItem[];
  gameVoteCounts?: Record<string, EventVoteCounts>;
  ratingChanges: MatchGameRating[];
  winners?: Array<{ userId: string; name: string; avatarUrl: string | null }>;
  resultProfiles?: Array<{
    userId: string;
    name: string;
    username?: string | null;
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

export const tableSeatOrderSchema = z
  .object({
    version: z.number().int().positive(),
    allocationKey: z.string().regex(/^[a-f0-9]{64}$/),
    seatedCount: z.number().int().nonnegative().optional(),
    registrations: z
      .array(
        z
          .object({
            id: z.uuid(),
            version: z.number().int().positive(),
            locked: z.boolean(),
            seatIndex: z.number().int().nonnegative().nullable().optional(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type TableSeatOrderInput = z.infer<typeof tableSeatOrderSchema>;
export interface TableSeatOrderSnapshot {
  version: number;
  allocationKey: string;
  capacity: number;
  seatedCount: number;
  registrations: Array<
    TableRegistration & {
      name?: string | null;
      username?: string | null;
      avatarUrl?: string | null;
    }
  >;
}
