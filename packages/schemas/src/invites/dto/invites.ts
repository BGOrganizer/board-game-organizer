import { z } from "zod";
import { joinTableSchema } from "../../events/dto/eventRecords";
import type {
  EventRecord,
  EventVoter,
  TableRecord,
  TableRegistration,
} from "../../events/models/eventRecord";
import type { BggSearchItem } from "../../games/dto/boardGames";

/** Existing friendship links and explicitly accepted contextual Table links share the API origin. */
export const createInviteParamsSchema = z.object({
  /** Legacy input; links always use the receiving API request origin. */
  webOrigin: z.string().url().max(255).optional(),
  /** Optional target email (kept for backwards compatibility). */
  email: z.string().email().max(255).optional(),
  tableId: z.uuid().optional(),
});

export const claimInviteParamsSchema = z.object({
  token: z.string().min(8).max(255),
  /** Contextual links grant the three disclosed relationships only after explicit acceptance. */
  consent: z.literal(true).optional(),
  participation: joinTableSchema.optional(),
});

export type InviteIdentity = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};
export type FriendInviteReviewResponse = {
  kind: "FRIEND";
  expiresAt: string;
  inviter: InviteIdentity;
};
export type TableInviteReviewResponse = {
  kind: "TABLE";
  expiresAt: string;
  inviter: InviteIdentity;
  group: { id: string; name: string };
  event: Pick<
    EventRecord,
    | "id"
    | "name"
    | "version"
    | "timeZone"
    | "startTime"
    | "dates"
    | "locations"
    | "planningMode"
    | "playerPreference"
    | "allowBestReduction"
  >;
  table: Pick<TableRecord, "id" | "games" | "minPlayers" | "maxPlayers" | "rankingEnabled"> & {
    name: string;
    order?: number;
    gamesDetail: BggSearchItem[];
  };
  requiresAvailability: boolean;
  ownAvailability: Pick<EventVoter, "dateVotes" | "locationVotes"> | null;
  ownRegistration: Pick<
    TableRegistration,
    "id" | "status" | "version" | "kind" | "gameVotes"
  > | null;
};
export type InviteReviewResponse = FriendInviteReviewResponse | TableInviteReviewResponse;
export const tableInviteClaimReceiptSchema = z.object({
  groupId: z.uuid(),
  eventId: z.uuid(),
  tableId: z.uuid(),
  position: z.enum(["SEATED", "WAITING"]),
});
export type TableInviteClaimReceipt = z.infer<typeof tableInviteClaimReceiptSchema>;
/** The client additionally requires a Table receipt when accepting a TABLE review. */
export const inviteClaimResponseSchema = z.object({
  success: z.literal(true),
  inviter: z
    .object({
      id: z.string().min(1),
      name: z.string(),
      email: z.string(),
      avatarUrl: z.string().nullable(),
    })
    .nullable(),
  table: tableInviteClaimReceiptSchema.optional(),
});
export type InviteClaimResponse = z.infer<typeof inviteClaimResponseSchema>;

export const inviteResultSchema = z.object({
  token: z.string(),
  link: z.string(),
  email: z.string().nullable(),
  expiresAt: z.date(),
});

export type CreateInviteParams = z.infer<typeof createInviteParamsSchema>;
export type ClaimInviteParams = z.infer<typeof claimInviteParamsSchema>;
export type InviteResult = z.infer<typeof inviteResultSchema>;
