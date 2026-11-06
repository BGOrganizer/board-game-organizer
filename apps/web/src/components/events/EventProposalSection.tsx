"use client";
import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  clientMutationPhase,
  type EventProposalCategory,
  eventProposalAuthors,
  eventProposalLabel,
  useEventProposalSection,
} from "@board-game-organizer/shared";
import { Button, Input, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarClock, Check, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventProposalItem } from "./EventProposalItem";
export function EventProposalSection({
  event,
  kind,
  table,
  disabled = false,
}: {
  event: PlannedEventResponse;
  kind: EventProposalCategory;
  table?: PlannedTableResponse;
  disabled?: boolean;
}) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    s = useEventProposalSection(o, event, kind, table, disabled);
  const openEditor = (draftId?: string) =>
    router.push(
      `/events/${encodeURIComponent(event.id)}/proposals/new?${new URLSearchParams({ kind, ...(table ? { tableId: table.id } : {}), ...(draftId ? { draftId } : {}) })}`,
    );
  return !s.visible ? null : (
    <section
      className="space-y-3"
      aria-label={
        kind === "date"
          ? t`Proposed dates/times`
          : kind === "location"
            ? t`Proposed locations`
            : t`Proposed games`
      }
    >
      <h3 className="font-semibold">
        {kind === "date"
          ? t`Proposed dates/times`
          : kind === "location"
            ? t`Proposed locations`
            : t`Proposed games`}
      </h3>
      {s.canPropose ? (
        <GroupedList>
          {kind === "date" ? (
            <DateProposalAction
              key={`${o.apiUrl}:${o.userId}:${event.id}:${event.version}`}
              submit={s.submitDate}
            />
          ) : kind === "location" ? (
            <LocationListRow name={t`Choose a location`} onPress={() => openEditor()} />
          ) : (
            <GameListRow name={t`Choose a game`} onPress={() => openEditor()} />
          )}
        </GroupedList>
      ) : null}
      {s.intents.map((intent) => {
        const phase =
          intent.status === "error" && !intent.context?.operation?.uncertain
            ? "failed"
            : clientMutationPhase(
                intent.status,
                intent.error,
                intent.context?.operation?.uncertain,
              );
        return (
          <div key={intent.draftId} className="space-y-2">
            <p>
              {eventProposalLabel(
                intent.variables.payload,
                intent.variables.clientLabel,
                i18n.locale,
              )}
            </p>
            <p role="status" className={phase === "failed" ? "text-danger" : "text-muted"}>
              {phase === "failed"
                ? t`Could not send proposal`
                : phase === "verifying"
                  ? t`Checking saved changes`
                  : t`Sending proposal`}
            </p>
            {phase === "failed" ? (
              <Button
                size="sm"
                variant="outline"
                onPress={() => openEditor(intent.draftId)}
              >{t`Review unsent proposal`}</Button>
            ) : null}
          </div>
        );
      })}
      {s.q.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {s.q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load proposals`}</p>
          <Button size="sm" onPress={() => void s.q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {!s.q.isPending && !s.q.isError && !s.q.items.length ? (
        <p role="status" className="text-muted">{t`No proposals`}</p>
      ) : null}
      <GroupedList>
        {s.q.items.map((row) => {
          const label = eventProposalLabel(row.payload, row.label, i18n.locale);
          return (
            <EventProposalItem
              key={row.id}
              row={row}
              authorNames={s.manager ? eventProposalAuthors(row) : undefined}
              actions={
                s.manager && event.status === "PLANNING" && row.status === "PENDING" ? (
                  <div className="flex gap-1">
                    <Button
                      isIconOnly
                      size="sm"
                      aria-label={`${t`Accept proposal`}: ${eventProposalAuthors(row)} — ${label}`}
                      isDisabled={
                        disabled ||
                        !s.q.hasVerifiedBase ||
                        s.actions.busy ||
                        Boolean(row.clientAction)
                      }
                      onPress={() => s.open(row, "accept")}
                    >
                      <Check className="size-5" aria-hidden />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      aria-label={`${t`Reject proposal`}: ${eventProposalAuthors(row)} — ${label}`}
                      isDisabled={
                        disabled ||
                        !s.q.hasVerifiedBase ||
                        s.actions.busy ||
                        Boolean(row.clientAction)
                      }
                      onPress={() => s.open(row, "reject")}
                    >
                      <X className="size-5" aria-hidden />
                    </Button>
                  </div>
                ) : null
              }
            >
              {s.manager && row.payload.kind !== "game" ? (
                <p className="text-sm text-muted">{row.authorName}</p>
              ) : null}
              {row.clientAction || row.status !== "PENDING" ? (
                <p role="status" className="text-sm text-muted">
                  {row.clientAction
                    ? row.clientAction === "accept"
                      ? t`Accepting proposal`
                      : t`Rejecting proposal`
                    : row.status === "ACCEPTED"
                      ? t`Accepted`
                      : t`Rejected`}
                </p>
              ) : null}
            </EventProposalItem>
          );
        })}
      </GroupedList>
      {s.q.canPrevious || s.q.data?.nextCursor ? (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            isDisabled={!s.q.canPrevious || s.q.isFetching}
            onPress={s.q.previous}
          >{t`Previous`}</Button>
          <span className="text-muted">
            {t`Page`} {s.q.page}
          </span>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={!s.q.data?.nextCursor || s.q.isFetching}
            onPress={s.q.next}
          >{t`Next`}</Button>
        </div>
      ) : null}
      {s.decision ? (
        <ContactConfirmDialog
          title={s.decision.action === "accept" ? t`Accept proposal` : t`Reject proposal`}
          description={
            s.validDecision
              ? `${eventProposalAuthors(s.decision.row)}: ${eventProposalLabel(s.decision.row.payload, s.decision.row.label, i18n.locale)}`
              : t`This proposal changed or the action is unavailable. Close and review current proposals.`
          }
          onCancel={s.cancel}
          actions={
            s.validDecision
              ? [
                  {
                    label: s.decision.action === "accept" ? t`Accept proposal` : t`Reject proposal`,
                    variant: s.decision.action === "accept" ? "primary" : "danger",
                    onPress: s.confirm,
                  },
                ]
              : []
          }
        />
      ) : null}
    </section>
  );
}

function DateProposalAction({ submit }: { submit: (wall: string) => boolean }) {
  const { t } = useLingui();
  const [wall, setWall] = useState("");
  return (
    <GroupedRow>
      <CalendarClock className="size-5 shrink-0 text-muted" aria-hidden />
      <TextField
        className="min-w-0 flex-1"
        aria-label={t`Date and time`}
        value={wall}
        onChange={setWall}
      >
        <Input name="proposedDateTime" autoComplete="off" type="datetime-local" step={60} />
      </TextField>
      <Button
        isIconOnly
        variant="primary"
        aria-label={t`Add date`}
        isDisabled={!wall}
        onPress={() => {
          if (submit(wall)) setWall("");
        }}
      >
        <Plus className="size-5" aria-hidden />
      </Button>
    </GroupedRow>
  );
}
