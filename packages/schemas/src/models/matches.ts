import { z } from "zod";

/**
 * A scheduled game session created by a user through the match wizard.
 * Stored in the `matches` collection.
 */
export const matchModel = z.object({
  id: z.string(),
  /** Owner of the match. */
  clerkId: z.string(),
  /** Match name — at least 5 characters. */
  name: z.string().min(5),
  /** One or more proposed date/time slots (wizard step 1). */
  dates: z.array(z.string().min(1)),
  /** Minimum number of players (wizard step 2). */
  minPlayers: z.number().int().min(1),
  /** Maximum number of players — must be >= minPlayers. */
  maxPlayers: z.number().int(),
  /** Invited friends (clerkIds). */
  invitedUserIds: z.array(z.string()),
  /** Selected board games (BGG ids). */
  gameIds: z.array(z.number()),
  createdAt: z.string(),
});

export type Match = z.infer<typeof matchModel>;

/** Request body to create a match (validated at the API boundary). */
export const createMatchSchema = z.object({
  name: z.string().trim().min(5, "Name must be at least 5 characters"),
  dates: z.array(z.string().min(1)).min(1, "At least one date is required"),
  minPlayers: z.number().int().min(1, "Minimum players must be at least 1"),
  maxPlayers: z.number().int(),
  invitedUserIds: z.array(z.string()).default([]),
  gameIds: z.array(z.number().int().positive()).min(1, "At least one game is required"),
});

export type CreateMatchInput = z.infer<typeof createMatchSchema>;
