import type { StateCreator } from "zustand";

/**
 * Theme preference for the whole app. "system" lets the platform's
 * appearance (light/dark) drive the theme automatically.
 */
export type ThemePreference = "system" | "light" | "dark";

export type ProfileUi = {
  tab: "activity" | "player" | "collection";
  gameId: number | null;
  activityKind: string;
};
export interface UiSlice {
  communityViews: Partial<
    Record<string, { tab: "activity" | "market"; network: "all" | "friends" | "following" }>
  >;
  setCommunityView: (
    key: string,
    patch: Partial<{ tab: "activity" | "market"; network: "all" | "friends" | "following" }>,
  ) => void;
  profileViews: Partial<Record<string, ProfileUi>>;
  setProfileView: (key: string, patch: Partial<ProfileUi>) => void;
  clearProfileViews: () => void;
  themePreference: ThemePreference;
  setThemePreference: (theme: ThemePreference) => void;
}

export const createUiSlice: StateCreator<UiSlice, [], []> = (set) => ({
  communityViews: {},
  setCommunityView: (key, patch) =>
    set((state) => ({
      communityViews: {
        ...state.communityViews,
        [key]: { tab: "activity", network: "all", ...state.communityViews[key], ...patch },
      },
    })),
  profileViews: {},
  setProfileView: (key, patch) =>
    set((state) => ({
      profileViews: {
        ...state.profileViews,
        [key]: {
          tab: "activity",
          gameId: null,
          activityKind: "",
          ...state.profileViews[key],
          ...patch,
        },
      },
    })),
  clearProfileViews: () => set({ profileViews: {}, communityViews: {} }),
  themePreference: "system",
  setThemePreference: (themePreference) => set({ themePreference }),
});
