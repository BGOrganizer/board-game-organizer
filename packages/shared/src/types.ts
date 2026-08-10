export interface UserStats {
  gamesOwned: number;
  gamesPlayed: number;
  friends: number;
}

/**
 * Profile payload returned by the API (`GET /api/profiles`).
 * Shared by the mobile and web apps.
 */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  preferredLanguage: string;
  plan: string;
  stats: UserStats;
}
