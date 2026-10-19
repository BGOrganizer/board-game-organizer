"use client";
import { communityAccessDenied, useEventResultsForm } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { TableScoreEditor } from "./TableScoreEditor";
export function EventResults({ eventId }: { eventId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    f = useEventResultsForm(o, eventId),
    event = communityAccessDenied(f.event.error) ? undefined : f.event.data;
  const finish = async () => {
    if (await f.finalize()) router.replace(`/events/${eventId}`);
  };
  if (!event)
    return f.event.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <div role="alert">
        <p className="text-danger">{t`Could not load event`}</p>
        <Button onPress={() => void f.event.refetch()}>{t`Try again`}</Button>
      </div>
    );
  if (!event.canFinalize && !f.actions.busy)
    return (
      <p
        role="alert"
        className="text-danger"
      >{t`Only an authorized organizer can finalize a confirmed event.`}</p>
    );
  if (f.selected)
    return f.playersReady ? (
      <TableScoreEditor
        key={f.selected}
        players={f.players}
        initial={f.scores[f.selected]}
        busy={f.actions.busy}
        onBack={f.close}
        onSubmit={f.save}
      />
    ) : (
      <div className="space-y-3">
        <Button variant="ghost" onPress={f.close}>{t`Back`}</Button>
        {f.seats.isPending ? <Skeleton className="h-40 w-full rounded-xl" /> : null}
        {f.seats.isError ? (
          <div role="alert">
            <p className="text-danger">{t`Could not load players`}</p>
            <Button onPress={() => void f.seats.refetch()}>{t`Try again`}</Button>
          </div>
        ) : null}
        {f.seats.hasNextPage ? (
          <Button
            isDisabled={f.seats.isFetchingNextPage}
            onPress={() => void f.seats.fetchNextPage()}
          >{t`Load more players`}</Button>
        ) : null}
      </div>
    );
  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28">
      <h1 className="text-xl font-semibold">{t`Register event results`}</h1>
      <p>{t`Enter every frozen player once for every included table. Finalization is atomic and irreversible. All-ND tables do not change ratings or statistics.`}</p>
      {f.conflict ? (
        <p
          role="alert"
          className="text-danger"
        >{t`This event changed. Go back and reopen the editor before saving.`}</p>
      ) : null}
      {f.included.map((row) => (
        <div
          key={row.id}
          className="flex items-center justify-between gap-3 rounded-xl bg-default-100 p-4"
        >
          <span>
            {row.name} · {f.scores[row.id] ? t`Scores ready` : t`Scores required`}
          </span>
          <Button
            isDisabled={f.actions.busy}
            onPress={() => f.open(row.id)}
          >{t`Edit scores`}</Button>
        </div>
      ))}
      {f.tables.isPending ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {f.tables.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load tables`}</p>
          <Button onPress={() => void f.tables.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {f.tables.hasNextPage ? (
        <Button
          isDisabled={f.tables.isFetchingNextPage}
          onPress={() => void f.tables.fetchNextPage()}
        >{t`Load more tables`}</Button>
      ) : null}
      <Button
        isDisabled={!f.ready || f.actions.busy}
        onPress={() => f.setConfirm(true)}
      >{t`Finalize event`}</Button>
      {f.confirm ? (
        <ContactConfirmDialog
          title={t`Finalize event?`}
          description={t`Results and ratings for all included tables become immutable together.`}
          busy={f.actions.busy}
          onCancel={() => f.setConfirm(false)}
          actions={[{ label: t`Finalize event`, variant: "primary", onPress: () => void finish() }]}
        >
          {f.error ? (
            <p
              role="alert"
              className="text-danger"
            >{t`Could not verify event finalization. Refresh the event before retrying.`}</p>
          ) : null}
        </ContactConfirmDialog>
      ) : null}
    </div>
  );
}
