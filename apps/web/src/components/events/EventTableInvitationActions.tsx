"use client";
import type { TableRegistration } from "@board-game-organizer/schemas";
import { useEventRecordActions } from "@board-game-organizer/shared";
import { useState } from "react";
import { InvitationActions } from "@/components/common/ui/InvitationActions";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventJoinSheet } from "./EventJoinSheet";

export function EventTableInvitationActions({
  eventId,
  registration,
}: {
  eventId: string;
  registration: TableRegistration;
}) {
  const a = useEventRecordActions(useCommunityApi(), eventId);
  const [accepting, setAccepting] = useState(false);
  if (registration.status !== "PENDING" || registration.kind !== "INVITATION") return null;
  return (
    <>
      <InvitationActions
        pending={a.busy}
        onAccept={() => {
          if (!a.busy) setAccepting(true);
        }}
        onDecline={() =>
          a.respond.mutate({
            registrationId: registration.id,
            input: { action: "decline", version: registration.version },
          })
        }
      />
      {accepting ? (
        <EventJoinSheet
          eventId={eventId}
          tableId={registration.tableId}
          registrationId={registration.id}
          onClose={() => setAccepting(false)}
        />
      ) : null}
    </>
  );
}
