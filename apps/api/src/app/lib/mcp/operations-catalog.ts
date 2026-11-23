import {
  bggCollectionQuerySchema,
  bggPickerQuerySchema,
  bggUsernameSchema,
  communityActivityQuerySchema,
  leaderboardQuerySchema,
  profileActivityQuerySchema,
  profileGameQuerySchema,
  profileHistoryQuerySchema,
  removeFavoriteLocationSchema,
  saveFavoriteLocationSchema,
  updatePreferredLanguageSchema,
} from "@board-game-organizer/schemas";
import { z } from "zod";
import * as bggAccountRoute from "@/app/api/bgg/account/route";
import * as bggAccountSyncRoute from "@/app/api/bgg/account/sync/route";
import * as bggCollectionRoute from "@/app/api/bgg/collection/route";
import * as bggPickerRoute from "@/app/api/bgg/picker/route";
import * as bggSearchRoute from "@/app/api/bgg/search/route";
import * as bggThingRoute from "@/app/api/bgg/thing/route";
import * as communityActivitiesRoute from "@/app/api/community/activities/route";
import { GET as getGlobalLeaderboard } from "@/app/api/community/leaderboard/route";
import * as locationsFavoritesRoute from "@/app/api/locations/favorites/route";
import * as locationsSearchRoute from "@/app/api/locations/search/route";
import * as profilesUserIdActivitiesRoute from "@/app/api/profiles/[userId]/activities/route";
import * as profilesUserIdGamesGameIdRoute from "@/app/api/profiles/[userId]/games/[gameId]/route";
import * as profilesUserIdGamesRoute from "@/app/api/profiles/[userId]/games/route";
import * as profilesUserIdRoute from "@/app/api/profiles/[userId]/route";
import * as profilesRoute from "@/app/api/profiles/route";
import { defineOperation } from "./operation";

const bggAccountBody = z.strictObject({ username: bggUsernameSchema });
const bggSyncQuery = z.strictObject({ retry: z.literal("true").optional() });
const bggSearchQuery = z.strictObject({ query: z.string().trim().min(4) });
const bggGameQuery = z.union([
  z.strictObject({ id: z.coerce.number().int().positive() }),
  z.strictObject({ ids: z.string().regex(/^[1-9][0-9]{0,15}(,[1-9][0-9]{0,15}){0,19}$/) }),
]);
const locationSearchQuery = z.strictObject({ query: z.string().trim().min(4).max(200) });
const favoriteLocationsQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  keys: z.string().max(35000).optional(),
});

export const catalogOperations = [
  defineOperation({
    name: "get_bgg_account",
    description: "Get the current BGG account link and collection sync status.",
    path: "/api/bgg/account",
    method: "GET",
    handler: bggAccountRoute.GET,
  }),
  defineOperation({
    name: "link_bgg_account",
    description: "Link your BGO profile to a BoardGameGeek username.",
    path: "/api/bgg/account",
    method: "POST",
    handler: bggAccountRoute.POST,
    body: bggAccountBody,
  }),
  defineOperation({
    name: "unlink_bgg_account",
    description:
      "Unlink the BoardGameGeek account and remove its collection from your BGO profile.",
    path: "/api/bgg/account",
    method: "DELETE",
    handler: bggAccountRoute.DELETE,
  }),
  defineOperation({
    name: "sync_bgg_collection",
    description:
      "Run a pending BoardGameGeek collection sync. Set retry to true to retry a failed sync.",
    path: "/api/bgg/account/sync",
    method: "POST",
    handler: bggAccountSyncRoute.POST,
    query: bggSyncQuery,
  }),
  defineOperation({
    name: "list_bgg_collection",
    description:
      "List games in a visible BGG collection snapshot, including another user's collection if shared.",
    path: "/api/bgg/collection",
    method: "GET",
    handler: bggCollectionRoute.GET,
    query: bggCollectionQuerySchema,
  }),
  defineOperation({
    name: "list_bgg_game_picker",
    description: "Find games available to pick from the catalog and permitted player collections.",
    path: "/api/bgg/picker",
    method: "GET",
    handler: bggPickerRoute.GET,
    query: bggPickerQuerySchema,
  }),
  defineOperation({
    name: "search_bgg_games",
    description: "Search the BoardGameGeek catalog by game name, using at least four characters.",
    path: "/api/bgg/search",
    method: "GET",
    handler: bggSearchRoute.GET,
    query: bggSearchQuery,
  }),
  defineOperation({
    name: "get_bgg_games",
    description: "Get BGG game metadata for one positive game ID, or up to 20 comma-separated IDs.",
    path: "/api/bgg/thing",
    method: "GET",
    handler: bggThingRoute.GET,
    query: bggGameQuery,
  }),
  defineOperation({
    name: "get_my_profile",
    description: "Get your BGO profile and account statistics.",
    path: "/api/profiles",
    method: "GET",
    handler: profilesRoute.GET,
  }),
  defineOperation({
    name: "update_profile_language",
    description: "Set the preferred BGO app language on your account.",
    path: "/api/profiles",
    method: "PATCH",
    handler: profilesRoute.PATCH,
    body: updatePreferredLanguageSchema,
  }),
  defineOperation({
    name: "get_user_profile",
    description: "Get another user's profile using the signed-in account's visibility rules.",
    path: "/api/profiles/[userId]",
    method: "GET",
    handler: profilesUserIdRoute.GET,
  }),
  defineOperation({
    name: "list_profile_games",
    description: "List the games and public rating summaries visible on a user's profile.",
    path: "/api/profiles/[userId]/games",
    method: "GET",
    handler: profilesUserIdGamesRoute.GET,
    query: profileGameQuerySchema,
  }),
  defineOperation({
    name: "get_profile_game_history",
    description: "Get the visible results and rating history of a player for one BGG game.",
    path: "/api/profiles/[userId]/games/[gameId]",
    method: "GET",
    handler: profilesUserIdGamesGameIdRoute.GET,
    query: profileHistoryQuerySchema,
  }),
  defineOperation({
    name: "list_profile_activity",
    description: "List a user's activity that is visible to you.",
    path: "/api/profiles/[userId]/activities",
    method: "GET",
    handler: profilesUserIdActivitiesRoute.GET,
    query: profileActivityQuerySchema,
  }),
  defineOperation({
    name: "list_global_leaderboard",
    description:
      "List games with a global OpenSkill leaderboard, or get players sorted by rating, games played, games won or no-result games for the selected game.",
    path: "/api/community/leaderboard",
    method: "GET",
    handler: getGlobalLeaderboard,
    query: leaderboardQuerySchema,
  }),
  defineOperation({
    name: "list_community_activity",
    description: "Get a page of visible activity from the BGO community.",
    path: "/api/community/activities",
    method: "GET",
    handler: communityActivitiesRoute.GET,
    query: communityActivityQuerySchema,
  }),
  defineOperation({
    name: "search_locations",
    description: "Search for a verified venue or address to use when planning on BGO.",
    path: "/api/locations/search",
    method: "GET",
    handler: locationsSearchRoute.GET,
    query: locationSearchQuery,
  }),
  defineOperation({
    name: "list_favorite_locations",
    description:
      "List your saved locations, optionally filtered by a JSON-encoded list of favorite keys.",
    path: "/api/locations/favorites",
    method: "GET",
    handler: locationsFavoritesRoute.GET,
    query: favoriteLocationsQuery,
  }),
  defineOperation({
    name: "save_favorite_location",
    description: "Save a verified address in your BGO favorites.",
    path: "/api/locations/favorites",
    method: "POST",
    handler: locationsFavoritesRoute.POST,
    body: saveFavoriteLocationSchema,
  }),
  defineOperation({
    name: "remove_favorite_location",
    description: "Remove an address from your saved BGO locations.",
    path: "/api/locations/favorites",
    method: "DELETE",
    handler: locationsFavoritesRoute.DELETE,
    body: removeFavoriteLocationSchema,
  }),
];
