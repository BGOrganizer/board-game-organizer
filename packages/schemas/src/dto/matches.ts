import { z } from "zod";
import {
  matchChoiceSchema,
  matchChoicesSchema,
  matchInvitationStatusSchema,
  matchStatusSchema,
} from "../models/matches";
import { targetUserIdSchema } from "./common";

export const matchInvitationResponseSchema = z.object({
  id: z.uuid(),
  matchId: z.uuid(),
  inviterUserId: z.string(),
  inviteeUserId: z.string(),
  status: matchInvitationStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  respondedAt: z.string().optional(),
});
export type MatchInvitationResponse = z.infer<typeof matchInvitationResponseSchema>;

export const matchResponseSchema = z.object({
  id: z.uuid(),
  adminUserId: z.string(),
  name: z.string(),
  dates: z.array(z.string()),
  minPlayers: z.number(),
  maxPlayers: z.number(),
  invitedUserIds: z.array(z.string()),
  gameIds: z.array(z.number()),
  status: matchStatusSchema,
  selectedDate: z.string().optional(),
  selectedGameId: z.number().optional(),
  /** Included by match listings when the selected catalog game is available. */
  selectedGameName: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  invitations: z.array(matchInvitationResponseSchema),
});
export type MatchResponse = z.infer<typeof matchResponseSchema>;

/** GET /api/matches — matches created by or inviting caller. */
export const listMatchesResponseSchema = z.object({ matches: z.array(matchResponseSchema) });
export type ListMatchesResponse = z.infer<typeof listMatchesResponseSchema>;

export const matchPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type MatchPlayer = z.infer<typeof matchPlayerSchema>;

export const matchInvitedPlayerSchema = matchPlayerSchema.extend({
  invitation: matchInvitationResponseSchema,
});
export type MatchInvitedPlayer = z.infer<typeof matchInvitedPlayerSchema>;

export const matchGameResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  yearPublished: z.number().nullable(),
  thumbnail: z.string().nullable(),
});
export type MatchGameResponse = z.infer<typeof matchGameResponseSchema>;

export const matchVoteCountsSchema = z.object({
  yes: z.number().int().nonnegative(),
  no: z.number().int().nonnegative(),
  ifNeeded: z.number().int().nonnegative(),
  notChosen: z.number().int().nonnegative(),
});
export type MatchVoteCounts = z.infer<typeof matchVoteCountsSchema>;

export const matchVoteSummarySchema = z.object({
  dates: z.record(z.string(), matchVoteCountsSchema),
  games: z.record(z.string(), matchVoteCountsSchema),
  reasons: z.array(z.enum(["NOT_ENOUGH_PLAYERS", "NO_SHARED_DATE", "NO_SHARED_GAME"])),
  selectedDate: z.string().optional(),
  selectedGameId: z.number().optional(),
});
export type MatchVoteSummary = z.infer<typeof matchVoteSummarySchema>;

export const matchDetailResponseSchema = z.object({
  match: matchResponseSchema,
  administrator: matchPlayerSchema,
  invitedPlayers: z.array(matchInvitedPlayerSchema),
  games: z.array(matchGameResponseSchema),
  choices: matchChoicesSchema.optional(),
  voteSummary: matchVoteSummarySchema.optional(),
});
export type MatchDetailResponse = z.infer<typeof matchDetailResponseSchema>;

export const setMatchChoiceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dates"),
    itemId: z.iso.datetime({ offset: true }),
    choice: matchChoiceSchema,
  }),
  z.object({
    kind: z.literal("games"),
    itemId: z.number().int().positive(),
    choice: matchChoiceSchema,
  }),
]);
export type SetMatchChoiceInput = z.infer<typeof setMatchChoiceSchema>;

export const setMatchStatusSchema = z.object({ status: matchStatusSchema }).strict();
export type SetMatchStatusInput = z.infer<typeof setMatchStatusSchema>;

export const inviteMatchUserSchema = z.object({ inviteeUserId: targetUserIdSchema }).strict();
export type InviteMatchUserInput = z.infer<typeof inviteMatchUserSchema>;

export const updateMatchSchema = z
  .object({
    name: z.string().trim().min(5).max(120).optional(),
    dates: z
      .array(z.iso.datetime({ offset: true }))
      .min(1)
      .refine((dates) => new Set(dates).size === dates.length)
      .optional(),
    minPlayers: z.number().int().min(2).optional(),
    maxPlayers: z.number().int().min(2).optional(),
    invitedUserIds: z
      .array(targetUserIdSchema)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
    gameIds: z
      .array(z.number().int().positive())
      .min(1)
      .refine((gameIds) => new Set(gameIds).size === gameIds.length)
      .optional(),
  })
  .strict()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "At least one field is required",
  })
  .refine(
    (input) =>
      input.minPlayers === undefined ||
      input.maxPlayers === undefined ||
      input.maxPlayers >= input.minPlayers,
    { path: ["maxPlayers"], message: "maxPlayers must be greater than or equal to minPlayers" },
  )
  .refine(
    (input) =>
      input.invitedUserIds === undefined ||
      input.maxPlayers === undefined ||
      input.invitedUserIds.length <= input.maxPlayers - 1,
    { path: ["invitedUserIds"], message: "Invitations exceed available player positions" },
  );
export type UpdateMatchInput = z.infer<typeof updateMatchSchema>;

export const respondMatchInvitationSchema = z
  .object({ decision: z.enum(["accept", "decline"]) })
  .strict();
export type RespondMatchInvitationInput = z.infer<typeof respondMatchInvitationSchema>;

/** BGG game search result — intentionally minimal. */
export const bggSearchItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  year: z.number().nullable(),
  imageUrl: z.string().nullable(),
});
export const bggSearchResponseSchema = z.object({ items: z.array(bggSearchItemSchema) });
export type BggSearchItem = z.infer<typeof bggSearchItemSchema>;
export type BggSearchResponse = z.infer<typeof bggSearchResponseSchema>;

/** BGG thing details fetched on selection. */
export const bggThingResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  year: z.number().nullable(),
});
export type BggThingResponse = z.infer<typeof bggThingResponseSchema>;

/** A friend match creator can invite. */
export const inviteableUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export const friendsResponseSchema = z.object({ users: z.array(inviteableUserSchema) });
export type InviteableUser = z.infer<typeof inviteableUserSchema>;
export type FriendsResponse = z.infer<typeof friendsResponseSchema>;
