export interface UserStats {
  friends: number;
  followers: number;
  following: number;
  playedMatches: number;
  adminGroups: number;
  joinedGroups: number;
}

/**
 * Profile payload returned by the API (`GET /api/profiles`).
 * Shared by the mobile and web apps.
 */
export interface UserProfile {
  id: string;
  name: string;
  username?: string | null;
  bgoRole?: "ADMIN";
  email: string;
  avatarUrl: string;
  preferredLanguage: string;
  plan: string;
  stats: UserStats;
}
