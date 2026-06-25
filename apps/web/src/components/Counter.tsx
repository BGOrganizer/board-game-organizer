"use client";

import { useAppStore } from "@board-game-organizer/store";

export function Counter() {
  const count = useAppStore((s) => s.count);
  const increment = useAppStore((s) => s.increment);
  const decrement = useAppStore((s) => s.decrement);
  const reset = useAppStore((s) => s.reset);

  return (
    <div className="mt-6 rounded-xl border border-divider bg-content1 p-4 text-center">
      <p className="mb-1 text-xs text-default-400">Counter (Zustand)</p>
      <p className="my-2 text-3xl font-bold">{count}</p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={decrement}
          className="rounded-lg border border-divider bg-default-100 px-4 py-2 text-sm transition hover:bg-default-200"
        >
          -1
        </button>
        <button
          type="button"
          onClick={increment}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white transition hover:bg-primary-600"
        >
          +1
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-divider bg-default-100 px-4 py-2 text-sm transition hover:bg-default-200"
        >
          Reset
        </button>
      </div>
    </div>
  );
}