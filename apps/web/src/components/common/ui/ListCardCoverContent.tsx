"use client";
import { Card } from "@heroui/react";
import type { ReactNode } from "react";

/** Full-width heading above bottom-aligned artwork, facts and visible wrapping controls. */
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
      <div data-slot="card-body-row" className="flex min-w-0 items-end gap-4">
        <div
          data-slot="card-artwork"
          className="relative size-24 shrink-0 overflow-hidden rounded-lg"
        >
          {artwork}
        </div>
        <div data-slot="card-facts" className="flex min-h-24 min-w-0 flex-1 flex-col gap-2">
          <div className="space-y-2">{children}</div>
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
              className="pointer-events-auto relative mt-auto flex max-w-full flex-wrap items-center justify-end gap-1 [&>*]:shrink-0"
            >
              {controls}
            </div>
          ) : null}
        </div>
      </div>
    </Card.Content>
  );
}
