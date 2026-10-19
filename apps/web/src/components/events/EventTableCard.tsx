"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useEventCutoff, useEventRecordActions } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Dices, X } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventTableCard({ table }: { table: PlannedTableResponse }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    a = useEventRecordActions(o, table.eventId),
    registration = table.myRegistration,
    closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  return (
    <LinkedListCard
      href={`/events/${table.eventId}/tables/${table.id}`}
      label={`${t`Open table`}: ${table.name}`}
      actions={
        table.canRespond && !closed && registration ? (
          <>
            <Button
              isIconOnly
              size="sm"
              aria-label={t`Accept invitation`}
              isDisabled={a.busy}
              onPress={() =>
                a.respond.mutate({
                  registrationId: registration.id,
                  input: { action: "accept", version: registration.version },
                })
              }
            >
              <Check className="size-4" />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              aria-label={t`Decline invitation`}
              isDisabled={a.busy}
              onPress={() =>
                a.respond.mutate({
                  registrationId: registration.id,
                  input: { action: "decline", version: registration.version },
                })
              }
            >
              <X className="size-4" />
            </Button>
          </>
        ) : undefined
      }
    >
      <AnimatedDicebearArtwork seed={table.id} variant="shapes" />
      <ListCardBody title={table.name} titleIcon={<Dices className="size-4" aria-hidden />}>
        <p className="text-sm text-default-500">
          {table.eventName} ·{" "}
          {table.eventStatus === "PLANNING"
            ? t`Planning`
            : table.eventStatus === "CONFIRMED"
              ? table.confirmed
                ? t`Confirmed`
                : t`Excluded from confirmation`
              : t`Terminated`}
        </p>
        <p className="text-sm">
          {t`Players`}: {table.seatedCount}/{table.maxPlayers} · {t`Waiting`}: {table.waitingCount}{" "}
          · {t`Pending`}: {table.pendingCount}
        </p>
        <p className="text-sm">
          {table.gamesDetail
            .filter((game) => !table.confirmed || game.id === table.confirmed.gameId)
            .map((game) => game.name)
            .join(", ")}
        </p>
        {table.winners?.length ? (
          <p className="text-sm">
            {t`Winners`}: {table.winners.map((row) => row.name).join(", ")}
          </p>
        ) : null}
        {table.myPosition ? (
          <p className="text-sm">
            {table.myPosition === "WAITING"
              ? t`Waiting list`
              : table.myPosition === "FROZEN"
                ? t`Confirmed player`
                : t`Reserved place`}
          </p>
        ) : null}
        {table.canRespond && !closed ? (
          <p className="pb-10 text-sm">{t`Invitation received`}</p>
        ) : null}
      </ListCardBody>
    </LinkedListCard>
  );
}
