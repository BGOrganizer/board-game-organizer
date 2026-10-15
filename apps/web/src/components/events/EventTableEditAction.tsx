"use client";
import { useEventTableContext } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { Pencil } from "lucide-react";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventTableEditAction({ eventId, tableId }: { eventId: string; tableId: string }) {
  const { t } = useLingui();
  const { event, table, open } = useEventTableContext(useCommunityApi(), eventId, tableId);
  if (event?.role !== "admin" || !table) return null;
  return (
    <FloatingActions
      label={t`Edit table`}
      href={`/events/${encodeURIComponent(eventId)}/tables/${encodeURIComponent(tableId)}/edit`}
      isDisabled={!event.canModify || !open || table.status !== "PLANNING"}
    >
      <Pencil className="size-6" aria-hidden />
    </FloatingActions>
  );
}
