"use client";

import { useAppStore } from "@board-game-organizer/store";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function Counter() {
  const count = useAppStore((s) => s.count);
  const increment = useAppStore((s) => s.increment);
  const decrement = useAppStore((s) => s.decrement);
  const reset = useAppStore((s) => s.reset);
  const { t } = useLingui();

  return (
    <div className="mt-6 rounded-xl border border-divider bg-content1 p-4 text-center">
      <p className="mb-1 text-xs text-default-400">{t`Counter (Zustand)`}</p>
      <p className="my-2 text-3xl font-bold">{count}</p>
      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={decrement}>
          -1
        </Button>
        <Button variant="primary" onClick={increment}>
          +1
        </Button>
        <Button variant="danger" onClick={reset}>
          {t`Reset`}
        </Button>
      </div>
    </div>
  );
}
