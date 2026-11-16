"use client";
import { Card } from "@heroui/react";
import type { ReactNode } from "react";

/** Full-width heading with a single bottom action row that may extend over the artwork. */
export function ListCardCoverContent({
  artwork,
  heading,
  children,
  controls,
  controlsDisabled = false,
}: {
  artwork: ReactNode;
  heading?: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
  controlsDisabled?: boolean;
}) {
  return (
    <Card.Content className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-3 p-4">
      {heading ? <div className="min-w-0">{heading}</div> : null}
      <div data-slot="card-body-row" className="relative flex min-w-0 items-end gap-4">
        <div
          data-slot="card-artwork"
          className="relative size-24 shrink-0 overflow-hidden rounded-lg"
        >
          {artwork}
        </div>
        <div
          data-slot="card-facts"
          className={`flex min-h-24 min-w-0 flex-1 flex-col gap-2 ${controls ? "pb-14" : ""}`}
        >
          <div className="space-y-2">{children}</div>
        </div>
        {controls ? (
          <div
            data-slot="card-controls"
            inert={controlsDisabled}
            onClickCapture={(event) => {
              if (controlsDisabled) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 overflow-x-auto overscroll-x-contain py-0.5"
          >
            <div className="flex w-max min-w-full flex-nowrap items-center justify-end gap-1 [&>*]:shrink-0">
              {controls}
            </div>
          </div>
        ) : null}
      </div>
    </Card.Content>
  );
}
