"use client";
import type { EventResponse, EventTableResponse } from "@board-game-organizer/schemas";
import {
  type EventDraftTable,
  editableEventTable,
  eventTableChanged,
  eventTableEditInput,
  useEventActions,
  useEventTableContext,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableEditor } from "./EventTableEditor";

export function EventTableEdit({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t } = useLingui();
  const context = useEventTableContext(useCommunityApi(), eventId, tableId);
  const { event, table } = context;
  const href = `/events/${encodeURIComponent(eventId)}/tables/${encodeURIComponent(tableId)}`;
  if (
    event &&
    table &&
    event.role === "admin" &&
    event.canModify &&
    context.open &&
    table.status === "PLANNING"
  )
    return <TableForm key={`${eventId}/${tableId}`} event={event} table={table} href={href} />;
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <Link className="inline-flex min-h-11 items-center gap-2 text-primary" href={href}>
        <ArrowLeft aria-hidden className="size-5" />
        {t`Back`}
      </Link>
      {context.eventQuery.isPending || (event && context.tableQuery.isPending) ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <div role="alert">
          <p>{t`Event cannot be edited`}</p>
          <Button
            onPress={() => {
              void context.eventQuery.refetch();
              if (event) void context.tableQuery.refetch();
            }}
          >{t`Retry`}</Button>
        </div>
      )}
    </section>
  );
}

function TableForm({
  event,
  table,
  href,
}: {
  event: EventResponse;
  table: EventTableResponse;
  href: string;
}) {
  const { t } = useLingui();
  const router = useRouter();
  const actions = useEventActions(useCommunityApi());
  const [version] = useState(event.version);
  const [pending, setPending] = useState<EventDraftTable | null>(null);
  const [failed, setFailed] = useState(false);
  const back = () => {
    if (!actions.busy) router.push(href);
  };
  const save = async (draft: EventDraftTable) => {
    if (actions.busy) return;
    try {
      await actions.update.mutateAsync({
        id: event.id,
        input: eventTableEditInput({ ...event, version }, draft.input),
      });
      setPending(null);
      router.push(href);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      {failed ? (
        <p
          role="alert"
          className="text-danger"
        >{t`Could not save event. Check your connection and event permissions, then try again.`}</p>
      ) : null}
      <EventTableEditor
        draft={{
          key: table.id,
          input: editableEventTable(table),
          gameName: table.gameName,
          imageUrl: table.image,
          demonstrator: table.demonstrator ?? undefined,
        }}
        timeZone={event.timeZone}
        eventStart={event.startsAt}
        eventEnd={event.endsAt}
        organizationId={event.organizationId}
        busy={actions.busy}
        onClose={back}
        onSave={(draft) => {
          if (actions.busy) return;
          if (!eventTableChanged(table, draft.input)) back();
          else setPending(draft);
        }}
      />
      {pending ? (
        <ContactConfirmDialog
          title={t`Reset reservations`}
          description={t`Affected bookings and invitations will be cancelled. Players must request or accept a place again.`}
          busy={actions.busy}
          onCancel={() => {
            if (!actions.busy) setPending(null);
          }}
          actions={[
            {
              label: t`Save changes`,
              variant: "danger",
              onPress: () => {
                void save(pending);
              },
            },
          ]}
        />
      ) : null}
    </>
  );
}
