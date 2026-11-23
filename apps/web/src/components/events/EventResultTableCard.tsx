"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleCheck, Dices, UserRoundCheck } from "lucide-react";
import { useId } from "react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useTableTitle } from "@/lib/useTableTitle";
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
  const { getTableTitle } = useTableTitle();
  const title = getTableTitle(table);
  const statusId = useId();
  return (
    <ListCard>
      <Button
        variant="ghost"
        isDisabled={busy}
        onPress={onPress}
        aria-label={`${t`Edit scores`}: ${title}`}
        aria-describedby={ready ? statusId : undefined}
        className="h-auto w-full items-start justify-start gap-3 rounded-xl p-3 text-left whitespace-normal"
      >
        <span className="relative size-16 shrink-0">
          <AnimatedDicebearArtwork seed={table.id} variant="tables" />
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
        <ListCardBody title={title} titleIcon={<Dices className="size-4 shrink-0" aria-hidden />}>
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
