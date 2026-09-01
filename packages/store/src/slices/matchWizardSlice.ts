import type { StateCreator } from "zustand";

/**
 * Wizard selection state shared between the match wizard and the search
 * pages (user/game pickers). The search pages write a selection here and
 * navigate back; the wizard reads it to populate its slots.
 *
 * This is transient form state (before submit) — the store is the right
 * place per the repo convention (server data stays in TanStack Query).
 */
export interface SelectedUser {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface SelectedGame {
  id: number;
  name: string;
  imageUrl: string | null;
  year: number | null;
}

export interface MatchWizardSlice {
  /** Pending selection written by a search page, keyed by slot id. */
  pendingUser: { slotId: string; user: SelectedUser } | null;
  pendingGame: { slotId: string; game: SelectedGame } | null;
  setPendingUser: (slotId: string, user: SelectedUser) => void;
  setPendingGame: (slotId: string, game: SelectedGame) => void;
  clearPending: () => void;
}

export const createMatchWizardSlice: StateCreator<MatchWizardSlice, [], []> = (set) => ({
  pendingUser: null,
  pendingGame: null,
  setPendingUser: (slotId, user) => set({ pendingUser: { slotId, user } }),
  setPendingGame: (slotId, game) => set({ pendingGame: { slotId, game } }),
  clearPending: () => set({ pendingUser: null, pendingGame: null }),
});
