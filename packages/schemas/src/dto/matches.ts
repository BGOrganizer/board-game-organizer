import { z } from "zod";

/** GET /api/matches — list of matches owned by the caller. */
export const listMatchesResponseSchema = z.object({
  matches: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      dates: z.array(z.string()),
      minPlayers: z.number(),
      maxPlayers: z.number(),
      invitedUserIds: z.array(z.string()),
      gameIds: z.array(z.number()),
      createdAt: z.string(),
    }),
  ),
});

export type ListMatchesResponse = z.infer<typeof listMatchesResponseSchema>;

/**
 * BGG game search result — intentionally minimal (id + name only).
 * Avatar/image and year are fetched via `thing` when a game is selected,
 * per product decision (search stays fast under BGG rate limits).
 */
export const bggSearchItemSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const bggSearchResponseSchema = z.object({
  items: z.array(bggSearchItemSchema),
});

export type BggSearchItem = z.infer<typeof bggSearchItemSchema>;
export type BggSearchResponse = z.infer<typeof bggSearchResponseSchema>;

/** BGG thing details (image + year) fetched on selection. */
export const bggThingResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  year: z.number().nullable(),
});

export type BggThingResponse = z.infer<typeof bggThingResponseSchema>;

/** A friend the match creator can invite (mutual follow). */
export const inviteableUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const friendsResponseSchema = z.object({
  users: z.array(inviteableUserSchema),
});

export type InviteableUser = z.infer<typeof inviteableUserSchema>;
export type FriendsResponse = z.infer<typeof friendsResponseSchema>;
