import type { TableRegistration } from "@board-game-organizer/schemas";
import { useEventRecordActions } from "@board-game-organizer/shared";
import { InvitationActions } from "@/components/common/ui/InvitationActions";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventTableInvitationActions({
  eventId,
  registration,
}: {
  eventId: string;
  registration: TableRegistration;
}) {
  const t = useT();
  const a = useEventRecordActions(useCommunityApi(), eventId);
  if (registration.status !== "PENDING" || registration.kind !== "INVITATION") return null;
  const respond = (action: "accept" | "decline") =>
    a.respond.mutate({
      registrationId: registration.id,
      input: { action, version: registration.version },
    });
  return (
    <InvitationActions
      placement="card"
      acceptLabel={t("Accept invitation")}
      declineLabel={t("Decline invitation")}
      pending={a.busy}
      onAccept={() => respond("accept")}
      onDecline={() => respond("decline")}
    />
  );
}
