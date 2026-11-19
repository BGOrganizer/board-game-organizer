"use client";

import type { ReactNode } from "react";

/** Page-owned navigation and actions below the persistent main menu. */
export function HeaderActions({ back, children }: { back: ReactNode; children?: ReactNode }) {
  return (
    <div data-page-toolbar className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">{back}</div>
      <div className="flex shrink-0 items-center justify-end gap-1 [&_svg]:size-5 [&_svg]:shrink-0 [&_.button]:min-h-11 [&_.button]:min-w-11">
        {children}
      </div>
    </div>
  );
}
