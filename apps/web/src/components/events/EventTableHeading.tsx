"use client";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { LayoutGrid, Trophy } from "lucide-react";

export function EventTableHeading({
  name,
  ratingsEnabled,
}: {
  name: string;
  ratingsEnabled: boolean;
}) {
  const { t } = useLingui();
  return (
    <div className="flex w-full items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <LayoutGrid aria-hidden className="size-4 shrink-0" />
          {t`Table name`}
        </p>
        <h1 className="break-words text-xl font-semibold">{name}</h1>
      </div>
      {ratingsEnabled ? (
        <Chip
          color="accent"
          variant="primary"
          size="sm"
          className="shrink-0"
          aria-label={t`Global ratings enabled`}
        >
          <Trophy aria-hidden className="size-4" />
          {t`Rating`}
        </Chip>
      ) : null}
    </div>
  );
}
