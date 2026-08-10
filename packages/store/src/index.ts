import { create } from "zustand";
import {
  createCounterSlice,
  type CounterSlice,
} from "./slices/counterSlice";
import { createUiSlice, type UiSlice } from "./slices/uiSlice";

/**
 * Combined application store.
 * Add more slices by extending the type and spreading them into `create`.
 *
 * Zustand holds ONLY local UI state (theme preference, open/closed state of
 * components, active tab, form state before submit, optimistic UI flags).
 * Server data (profiles, lists, games…) lives in TanStack Query — never in
 * this store.
 *
 * @example
 * ```ts
 * import { createUserSlice, UserSlice } from "./slices/userSlice";
 *
 * export type AppStore = CounterSlice & UiSlice & UserSlice;
 *
 * export const useAppStore = create<AppStore>()((...a) => ({
 *   ...createCounterSlice(...a),
 *   ...createUiSlice(...a),
 *   ...createUserSlice(...a),
 * }));
 * ```
 */
export type AppStore = CounterSlice & UiSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createCounterSlice(...a),
  ...createUiSlice(...a),
}));
