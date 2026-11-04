"use client";
import { communityAccessDenied, useEventResultsForm } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { headerButtonProps } from "@/components/common/layout/headerStyles";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { TableScoreEditor } from "./TableScoreEditor";
export function EventResults({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    f = useEventResultsForm(o, eventId, tableId);
  const denied = communityAccessDenied(f.event.error) || communityAccessDenied(f.table.error);
  const busy = f.actions.busy || f.checking;
  return (
    <div className="mx-auto max-w-4xl space-y-3 pb-28">
      <HeaderActions>
        <div className="flex max-w-[60vw] items-center gap-2">
          <Button
            {...headerButtonProps}
            variant="ghost"
            aria-label={t`Back`}
            isDisabled={f.actions.busy}
            onPress={() => router.back()}
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
          <h1 className="min-w-0 truncate text-base font-semibold">{t`Register result`}</h1>
        </div>
      </HeaderActions>
      {!denied && f.table.data ? <h2 className="font-semibold">{f.table.data.name}</h2> : null}
      {f.event.isError || f.table.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load table`}</p>
          <Button
            onPress={() => {
              void f.event.refetch();
              void f.table.refetch();
            }}
          >{t`Try again`}</Button>
        </div>
      ) : null}
      {f.event.data &&
      f.table.data &&
      !f.event.isError &&
      !f.table.isError &&
      !f.allowed &&
      !denied ? (
        <p
          role="alert"
          className="text-danger"
        >{t`Only an authorized organizer can record results for an included confirmed table.`}</p>
      ) : null}
      {f.allowed ? (
        <p className="text-muted">{t`Saved scores remain editable. Ratings and statistics update only when the event is finalized.`}</p>
      ) : null}
      {f.checking ? <p role="status">{t`Checking saved changes`}</p> : null}
      {f.conflict ? (
        <p
          role="alert"
          className="text-danger"
        >{t`This event changed. Go back and reopen the editor before saving.`}</p>
      ) : null}
      {f.error ? (
        <p role="alert" className="text-danger">{t`Could not save table result`}</p>
      ) : null}
      {f.playersReady && !denied ? (
        <TableScoreEditor
          key={tableId}
          players={f.players}
          initial={f.initial}
          busy={busy || f.conflict}
          onSubmit={(input) =>
            f.save(input, () => router.replace(`/events/${eventId}/tables/${tableId}`))
          }
        />
      ) : f.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : null}
      {f.allowed && (f.seats.isError || f.playersIncomplete) ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load players`}</p>
          <Button onPress={() => void f.seats.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {f.allowed && f.seats.hasNextPage ? (
        <Button
          isDisabled={f.seats.isFetchingNextPage}
          onPress={() => void f.seats.fetchNextPage()}
        >{t`Load more players`}</Button>
      ) : null}
    </div>
  );
}
