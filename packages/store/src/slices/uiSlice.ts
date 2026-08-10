import type { StateCreator } from "zustand";

/**
 * Theme preference for the whole app. "system" lets the platform's
 * appearance (light/dark) drive the theme automatically.
 */
export type ThemePreference = "system" | "light" | "dark";

export interface UiSlice {
  themePreference: ThemePreference;
  setThemePreference: (theme: ThemePreference) => void;
}

export const createUiSlice: StateCreator<UiSlice, [], []> = (set) => ({
  themePreference: "system",
  setThemePreference: (themePreference) => set({ themePreference }),
});
