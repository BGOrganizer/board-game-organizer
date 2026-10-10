"use client";
import {
  communityAccessDenied,
  useEvent,
  useEventActions,
  useEventTables,
  useEventWindow,
} from "@board-game-organizer/shared";
import { Button, Skeleton, Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventCard } from "./EventCard";
import { EventTableCard } from "./EventTableCard";

export function EventDetail({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { t, i18n } = useLingui();
  const options = useCommunityApi();
  const detail = useEvent(options, eventId);
  const event = communityAccessDenied(detail.error) ? undefined : detail.data;
  const open = useEventWindow(event);
  const actions = useEventActions(options);
  const [tab, setTab] = useState("details");
  const [cancel, setCancel] = useState(false);
  const tables = useEventTables(
    { ...options, enabled: Boolean(event) && tab === "tables" },
    eventId,
  );
  const endRef = useInfiniteScroll({
    hasNextPage: tab === "tables" && tables.hasNextPage,
    isFetchingNextPage: tables.isFetchingNextPage,
    isFetchNextPageError: tables.isFetchNextPageError,
    fetchNextPage: () => tables.fetchNextPage(),
  });
  const editable = Boolean(event?.canModify && open);
  if (!event)
    return (
      <div>
        {detail.isPending ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (
          <div role="alert">
            <p>{t`Could not load event`}</p>
            <Button onPress={() => void detail.refetch()}>{t`Retry`}</Button>
          </div>
        )}
      </div>
    );
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 pb-28">
      <header className="flex items-center gap-3">
        <Link
          href="/events"
          aria-label={t`Back`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 break-words text-xl font-semibold">{event.name}</h1>
        {editable ? (
          <Button
            isIconOnly
            variant="danger-soft"
            aria-label={t`Cancel event`}
            isDisabled={actions.busy}
            onPress={() => setCancel(true)}
          >
            <Trash2 className="size-5" aria-hidden />
          </Button>
        ) : null}
      </header>
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label={t`Event sections`}>
            <Tabs.Tab id="details">
              {t`Details`}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="tables">
              {t`Tables`}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="details" className="space-y-4 pt-4">
          <EventCard event={event} presentation="detail" />
          <p className="text-sm">
            {t`Booking deadline`}:{" "}
            {new Intl.DateTimeFormat(i18n.locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: event.timeZone,
            }).format(new Date(event.bookingClosesAt))}{" "}
            · {event.timeZone}
          </p>
          {!open && event.status === "PUBLISHED" ? (
            <p>{t`Bookings are closed. Results can still be recorded.`}</p>
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel id="tables" className="space-y-3 pt-4">
          {tables.isPending && !tables.items.length ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : null}
          {tables.items.map((table) => (
            <EventTableCard key={table.id} table={table} timeZone={event.timeZone} />
          ))}
          {!tables.isPending && !tables.isError && !tables.items.length ? (
            <EmptyList icon={<LayoutGrid className="size-7" />}>{t`No tables found`}</EmptyList>
          ) : null}
          {tables.isError ? (
            <Button onPress={() => void tables.refetch()}>{t`Could not load tables. Retry`}</Button>
          ) : null}
          {tables.hasNextPage ? (
            <Button
              isDisabled={tables.isFetchingNextPage}
              onPress={() => void tables.fetchNextPage()}
            >
              {tables.isFetchNextPageError ? t`Retry` : t`Load more`}
            </Button>
          ) : null}
          {tables.isFetchingNextPage ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
          <div ref={endRef} className="h-1" aria-hidden />
        </Tabs.Panel>
      </Tabs>
      {editable ? (
        <FloatingActions
          href={`/events/${event.id}/edit`}
          label={t`Edit event`}
          isDisabled={actions.busy}
        >
          <Pencil className="size-6" aria-hidden />
        </FloatingActions>
      ) : null}
      {cancel ? (
        <ContactConfirmDialog
          title={t`Cancel event`}
          description={t`All unfinished tables and reservations will be cancelled.`}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setCancel(false);
          }}
          actions={[
            {
              label: t`Cancel event`,
              variant: "danger",
              onPress: () => {
                if (!editable || actions.busy) return;
                void actions.cancel
                  .mutateAsync(event.id)
                  .then(() => {
                    setCancel(false);
                    router.replace("/events");
                  })
                  .catch(() => {});
              },
            },
          ]}
        />
      ) : null}
    </section>
  );
}
