import type { StateCreator } from "zustand";

export interface AttentionPulseSlice {
  /** UI-only high-water marks. Never persisted, never copied from server entity state. */
  playedAttentionPulses: Record<string, string>;
  claimAttentionPulse: (owner: string, itemId: string, signal: string) => boolean;
}
export const createAttentionPulseSlice: StateCreator<AttentionPulseSlice, [], []> = (set, get) => ({
  playedAttentionPulses: {},
  claimAttentionPulse: (owner, itemId, signal) => {
    const key = JSON.stringify([owner, itemId]);
    const previous = get().playedAttentionPulses[key];
    if (previous !== undefined && previous >= signal) return false;
    set((state) => ({ playedAttentionPulses: { ...state.playedAttentionPulses, [key]: signal } }));
    return true;
  },
});
