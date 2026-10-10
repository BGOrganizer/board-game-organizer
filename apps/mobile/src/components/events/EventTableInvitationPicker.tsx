import type { EventResponse, EventTableResponse } from "@board-game-organizer/schemas";
import { useEventActions, useEventWindow } from "@board-game-organizer/shared";
import { OrganizationMemberPicker } from "@/components/organizations/OrganizationMemberPicker";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventTableInvitationPicker({
  event,
  table,
  occupied,
  onClose,
}: {
  event: EventResponse;
  table: EventTableResponse;
  occupied: readonly string[];
  onClose: () => void;
}) {
  const t = useT();
  const actions = useEventActions(useCommunityApi());
  const open = useEventWindow(event);
  const canInvite =
    event.role === "admin" &&
    event.status === "PUBLISHED" &&
    event.canModify &&
    open &&
    table.status === "PLANNING" &&
    table.reservedCount < table.maxPlayers;
  return (
    <OrganizationMemberPicker
      title={t("Invite organization members")}
      organizationId={event.organizationId}
      isDisabled={(member) => actions.busy || !canInvite || occupied.includes(member.userId)}
      onClose={() => {
        if (!actions.busy) onClose();
      }}
      onSelect={(member) => {
        if (actions.busy || !canInvite || occupied.includes(member.userId)) return;
        void actions.invite
          .mutateAsync({ eventId: event.id, tableId: table.id, userId: member.userId })
          .then(onClose)
          .catch(() => undefined);
      }}
    />
  );
}
