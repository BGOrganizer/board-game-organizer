"use client";
import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  clientMutationPhase,
  type EventProposalCategory,
  eventProposalLabel,
  useEventProposalSection,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
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
      aria-label={s.manager ? t`Participant proposals` : t`Your proposals`}
    >
      <h3 className="font-semibold">{s.manager ? t`Participant proposals` : t`Your proposals`}</h3>
      {s.canPropose ? (
        <Button size="sm" variant="outline" onPress={() => openEditor()}>{t`Add proposal`}</Button>
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
            <GroupedRow key={row.id}>
              <div data-testid={`event-proposal-${row.id}`} className="min-w-0 flex-1 space-y-1">
                <p className="break-words">{label}</p>
                {s.manager ? <p className="text-sm text-muted">{row.authorName}</p> : null}
                <p role="status" className="text-sm text-muted">
                  {row.clientAction
                    ? row.clientAction === "accept"
                      ? t`Accepting proposal`
                      : t`Rejecting proposal`
                    : row.status === "PENDING"
                      ? t`Pending`
                      : row.status === "ACCEPTED"
                        ? t`Accepted`
                        : t`Rejected`}
                </p>
              </div>
              {s.manager && event.status === "PLANNING" && row.status === "PENDING" ? (
                <div className="flex gap-1">
                  <Button
                    isIconOnly
                    size="sm"
                    aria-label={`${t`Accept proposal`}: ${row.authorName} — ${label}`}
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
                    aria-label={`${t`Reject proposal`}: ${row.authorName} — ${label}`}
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
              ) : null}
            </GroupedRow>
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
              ? `${s.decision.row.authorName}: ${eventProposalLabel(s.decision.row.payload, s.decision.row.label, i18n.locale)}`
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
