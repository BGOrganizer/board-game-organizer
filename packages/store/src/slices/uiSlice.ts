import type { StateCreator } from "zustand";

/**
 * Theme preference for the whole app. "system" lets the platform's
 * appearance (light/dark) drive the theme automatically.
 */
export type ThemePreference = "system" | "light" | "dark";

export type ProfileUi = { tab: "activity" | "player"; gameId: number | null; activityKind: string };
export interface UiSlice {
  profileViews: Partial<Record<string, ProfileUi>>;
  setProfileView: (key: string, patch: Partial<ProfileUi>) => void;
  clearProfileViews: () => void;
  themePreference: ThemePreference;
  setThemePreference: (theme: ThemePreference) => void;
}

export const createUiSlice: StateCreator<UiSlice, [], []> = (set) => ({
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
  clearProfileViews: () => set({ profileViews: {} }),
  themePreference: "system",
  setThemePreference: (themePreference) => set({ themePreference }),
});
