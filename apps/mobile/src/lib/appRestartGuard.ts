import { create } from "zustand";

/** Mounted editors and confirmation overlays block a restart, including behind other routes. */
export const useAppRestartGuard = create<{ blocks: number }>(() => ({ blocks: 0 }));

export function blockAppRestart() {
  let released = false;
  useAppRestartGuard.setState((state) => ({ blocks: state.blocks + 1 }));
  return () => {
    if (released) return;
    released = true;
    useAppRestartGuard.setState((state) => ({ blocks: state.blocks - 1 }));
  };
}
