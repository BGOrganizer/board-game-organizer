"use client";
import { communityAccessDenied, useEventResultsForm } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventResultTableCard } from "./EventResultTableCard";
import { TableScoreEditor } from "./TableScoreEditor";
export function EventResults({ eventId }: { eventId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    f = useEventResultsForm(o, eventId),
    event = communityAccessDenied(f.event.error) ? undefined : f.event.data;
  const header = (
    <HeaderActions>
      <div className="flex max-w-[35vw] items-center gap-2 sm:max-w-64">
        <Button
          isIconOnly
          variant="ghost"
          aria-label={t`Back`}
          isDisabled={f.actions.busy}
          onPress={() => (f.selected ? f.close() : router.back())}
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <h1 className="min-w-0 truncate text-base font-semibold">
          {f.selected ? t`Register Table Result` : t`Register Tables Results`}
        </h1>
      </div>
    </HeaderActions>
  );
  const tableError = f.table.isError ? (
    <div role="alert">
      <p className="text-danger">{t`Could not load table`}</p>
      <Button onPress={() => void f.table.refetch()}>{t`Try again`}</Button>
    </div>
  ) : null;
  const finish = () => {
    if (f.finalize()) router.replace(`/events/${eventId}`);
  };
  if (!event)
    return f.event.isPending ? (
      <>
        {header}
        <Skeleton className="h-40 w-full rounded-xl" />
      </>
    ) : (
      <div role="alert">
        {header}
        <p className="text-danger">{t`Could not load event`}</p>
        <Button onPress={() => void f.event.refetch()}>{t`Try again`}</Button>
      </div>
    );
  if (!event.canFinalize && !f.actions.busy)
    return (
      <p role="alert" className="text-danger">
        {header}
        {t`Only an authorized organizer can finalize a confirmed event.`}
      </p>
    );
  if (f.selected)
    return f.playersReady ? (
      <>
        {header}
        {tableError}
        <TableScoreEditor
          key={f.selected}
          players={f.players}
          initial={f.scores[f.selected]}
          busy={f.actions.busy}
          onSubmit={f.save}
        />
      </>
    ) : (
      <div className="space-y-3">
        {header}
        {tableError}
        {f.table.isPending || f.seats.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : null}
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
      {header}
      <SearchHelpLabel
        label={t`Tables list`}
        helpTitle={t`Field help`}
        help={t`Record results for every table to finalize the event. Finalization is irreversible. All-ND tables do not change ratings or statistics.`}
      />
      {f.checking ? <p role="status">{t`Checking saved changes`}</p> : null}
      {f.conflict ? (
        <p
          role="alert"
          className="text-danger"
        >{t`This event changed. Go back and reopen the editor before saving.`}</p>
      ) : null}
      {f.included.map((row) => (
        <EventResultTableCard
          key={row.id}
          table={row}
          ready={f.isScoreCurrent(row.id)}
          busy={f.actions.busy}
          onPress={() => f.open(row.id)}
        />
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
      <Button isDisabled={!f.ready || f.actions.busy} onPress={() => f.setConfirm(true)}>
        <Flag className="size-4" aria-hidden />
        {t`Finalize event`}
      </Button>
      {f.confirm ? (
        <ContactConfirmDialog
          title={t`Finalize event?`}
          description={t`Results and ratings for all included tables become immutable together.`}
          busy={f.actions.busy}
          onCancel={() => f.setConfirm(false)}
          actions={[
            {
              label: t`Finalize event`,
              variant: "primary",
              icon: <Flag className="size-4" aria-hidden />,
              onPress: () => void finish(),
            },
          ]}
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
