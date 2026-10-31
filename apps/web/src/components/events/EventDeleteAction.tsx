"use client";
import type {
  DeletePlannedRecordInput,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  eventRecordKeys,
  useClientMutationDraft,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ClientRecordBadge } from "@/components/common/ui/ClientRecordBadge";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventDeleteAction({
  event,
  table,
  disabled = false,
}: {
  event: PlannedEventResponse;
  table?: PlannedTableResponse;
  disabled?: boolean;
}) {
  const { t } = useLingui(),
    options = useCommunityApi(),
    actions = useEventRecordActions(options, event.id),
    router = useRouter();
  const intent = useClientMutationDraft<DeletePlannedRecordInput & { tableId?: string }>(
    eventRecordKeys.mutation(options, event.id, table ? "remove-table" : "remove"),
    event.version,
    (input) => input?.tableId === table?.id,
  );
  const verifying = intent?.phase === "verifying",
    hintId = useId();
  const [confirm, setConfirm] = useState<number | null>(null),
    submitted = useRef(false);
  const allowed =
    event.adminUserId === options.userId &&
    event.status === "PLANNING" &&
    (!table ||
      (table.adminUserId === options.userId &&
        table.eventId === event.id &&
        table.eventStatus === "PLANNING"));
  const blocked =
    disabled ||
    actions.busy ||
    verifying ||
    !event.canEdit ||
    Boolean(table && event.tableCount <= 1);
  useEffect(() => {
    if (confirm !== null && (!allowed || blocked || confirm !== event.version)) setConfirm(null);
  }, [allowed, blocked, confirm, event.version]);
  if (!allowed) return null;
  const label = table ? t`Delete table` : t`Delete event`;
  const hint =
    table && event.tableCount <= 1
      ? t`An event must keep at least one table. Delete the event instead.`
      : undefined;
  const remove = () => {
    if (submitted.current || blocked || confirm !== event.version) return;
    submitted.current = true;
    if (table) actions.removeTable.mutate({ tableId: table.id, version: event.version });
    else actions.remove.mutate({ version: event.version });
    setConfirm(null);
    router.replace(
      table
        ? `/events/${event.id}`
        : event.groupId
          ? `/groups/${event.groupId}?tab=events`
          : "/events",
    );
  };
  return (
    <div className="flex items-center gap-1">
      {verifying ? <ClientRecordBadge phase="verifying" /> : null}
      <Button
        isIconOnly
        size="sm"
        variant="danger-soft"
        className="size-9 min-h-9 min-w-9"
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        isDisabled={blocked}
        onPress={() => setConfirm(event.version)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
      {hint ? (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      ) : null}
      {confirm ? (
        <ContactConfirmDialog
          title={table ? t`Delete table?` : t`Delete event?`}
          description={
            table
              ? t`Delete this table and cancel its active registrations?`
              : t`Permanently delete this event, all its tables, registrations and votes?`
          }
          busy={blocked}
          onCancel={() => setConfirm(null)}
          actions={[
            {
              label,
              variant: "danger",
              icon: <Trash2 className="size-4" aria-hidden />,
              onPress: remove,
            },
          ]}
        />
      ) : null}
    </div>
  );
}
