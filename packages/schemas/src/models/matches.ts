import { z } from "zod";
import { targetUserIdSchema } from "../dto/common";

export const matchStatusSchema = z.enum(["PLANNING", "CREATED"]);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const matchInvitationStatusSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED"]);
export type MatchInvitationStatus = z.infer<typeof matchInvitationStatusSchema>;

/** Match persisted independently from invitation lifecycle. */
export const matchModel = z.object({
  id: z.uuid(),
  /** Match administrator and creator (Clerk user ID). */
  clerkId: targetUserIdSchema,
  name: z.string().min(5).max(120),
  dates: z.array(z.iso.datetime({ offset: true })).min(1),
  minPlayers: z.number().int().min(2),
  maxPlayers: z.number().int().min(2),
  gameIds: z.array(z.number().int().positive()).min(1),
  status: matchStatusSchema,
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
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  respondedAt: z.iso.datetime({ offset: true }).optional(),
});
export type MatchInvitation = z.infer<typeof matchInvitationModel>;

export const MATCH_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { clerkId: 1, createdAt: -1 } },
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
    minPlayers: z.number().int().min(2, "Minimum players must be at least 2"),
    maxPlayers: z.number().int().min(2),
    invitedUserIds: z.array(targetUserIdSchema).default([]),
    gameIds: z.array(z.number().int().positive()).min(1, "At least one game is required"),
  })
  .strict()
  .superRefine((value, context) => {
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

/** Board game imported from BGG rankings CSV. */
export const boardGameModel = z.object({
  id: z.number(),
  name: z.string(),
  yearPublished: z.number().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  imageCheckedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type BoardGame = z.infer<typeof boardGameModel>;
