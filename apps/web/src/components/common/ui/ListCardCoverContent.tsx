"use client";
import { Card } from "@heroui/react";
import type { ReactNode } from "react";

/** The same contained artwork, text and control layout for live rows and factual drafts. */
export function ListCardCoverContent({
  artwork,
  children,
  controls,
  controlsDisabled = false,
}: {
  artwork: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
  controlsDisabled?: boolean;
}) {
  return (
    <Card.Content className="pointer-events-none relative flex min-w-0 flex-1 flex-col p-0">
      <div className="flex min-w-0 items-start gap-4 p-4 pb-0">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-lg">{artwork}</div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {controls ? (
        <div
          inert={controlsDisabled}
          onClickCapture={(event) => {
            if (controlsDisabled) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          className="pointer-events-auto relative mx-2 mb-2 overflow-x-auto overscroll-x-contain p-1"
        >
          <div className="flex w-max min-w-full flex-nowrap items-center justify-end [&>*]:shrink-0">
            {controls}
          </div>
        </div>
      ) : null}
    </Card.Content>
  );
}
