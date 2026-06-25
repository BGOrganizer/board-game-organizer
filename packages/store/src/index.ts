import { create } from "zustand";
import {
  createCounterSlice,
  type CounterSlice,
} from "./slices/counterSlice";

/**
 * Combined application store.
 * Add more slices by extending the type and spreading them into `create`.
 *
 * @example
 * ```ts
 * import { createUserSlice, UserSlice } from "./slices/userSlice";
 *
 * export type AppStore = CounterSlice & UserSlice;
 *
 * export const useAppStore = create<AppStore>()((...a) => ({
 *   ...createCounterSlice(...a),
 *   ...createUserSlice(...a),
 * }));
 * ```
 */
export type AppStore = CounterSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createCounterSlice(...a),
}));