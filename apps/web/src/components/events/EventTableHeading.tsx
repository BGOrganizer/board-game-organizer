"use client";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Armchair, LayoutGrid, LockKeyhole, Trophy, UsersRound } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";

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
        <div className="flex items-center gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <LayoutGrid aria-hidden className="size-4 shrink-0" />
            {t`Table name`}
          </p>
          <HelpPopover label={t`Table name help`} title={t`Table name`}>
            <IconLegend
              items={[
                { icon: UsersRound, description: t`Confirmed players.` },
                { icon: Armchair, description: t`Maximum seats here; free places in Seats.` },
                { icon: LockKeyhole, description: t`Reserved places, including pending requests.` },
              ]}
            />
          </HelpPopover>
        </div>
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
