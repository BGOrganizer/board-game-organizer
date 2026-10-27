"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleCheck, Dices, UserRoundCheck } from "lucide-react";
import { useId } from "react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
export function EventResultTableCard({
  table,
  ready,
  busy,
  onPress,
}: {
  table: PlannedTableResponse;
  ready: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { t, i18n } = useLingui();
  const statusId = useId();
  return (
    <ListCard>
      <Button
        variant="ghost"
        isDisabled={busy}
        onPress={onPress}
        aria-label={`${t`Edit scores`}: ${table.name}`}
        aria-describedby={ready ? statusId : undefined}
        className="h-auto w-full items-start justify-start gap-3 rounded-xl p-3 text-left whitespace-normal"
      >
        <span className="relative size-16 shrink-0">
          <AnimatedDicebearArtwork seed={table.id} variant="planets" />
          {ready ? (
            <span
              role="img"
              aria-label={t`Scores ready`}
              id={statusId}
              className="absolute bottom-0 right-0 rounded-tl-lg bg-surface p-1 text-success"
            >
              <CircleCheck className="size-4" aria-hidden />
              <span className="sr-only">{t`Scores ready`}</span>
            </span>
          ) : null}
        </span>
        <ListCardBody
          title={table.name}
          titleIcon={<Dices className="size-4 shrink-0" aria-hidden />}
        >
          <span className="block text-sm">
            {table.gamesDetail.find((game) => game.id === table.confirmed?.gameId)?.name ??
              t`Unknown`}
          </span>
          <span className="inline-flex items-center gap-1 text-sm">
            <UserRoundCheck className="size-4" aria-hidden />
            <span className="sr-only">{t`Players`}: </span>
            {new Intl.NumberFormat(i18n.locale).format(table.confirmed?.playerIds.length ?? 0)}
          </span>
        </ListCardBody>
      </Button>
    </ListCard>
  );
}
