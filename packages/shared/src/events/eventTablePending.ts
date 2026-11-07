import type { TableInviteeResponse } from "@board-game-organizer/schemas";
import type { UserProfile } from "../common/types";
import type { EventTablePlace } from "./eventTableRoster";

export type PendingTableInvitation = {
  key: string;
  userId: string;
  person?: Pick<TableInviteeResponse, "name" | "username" | "avatarUrl">;
};
export type PendingTablePlace = {
  key: string;
  kind: "pending";
  userId: string;
  name: string;
  avatarUrl: string | null;
  action?: "join" | "accept";
  phase?: "saving" | "verifying";
};

/** Show the known recipient immediately, without fabricating a registration ID,
 * server priority, physical seat, consent or another user's private identity. */
export function pendingInvitationPlaces(
  rows: readonly EventTablePlace[],
  invitations: readonly PendingTableInvitation[],
  knownUserIds: readonly string[] = [],
): Array<EventTablePlace | PendingTablePlace> {
  const players = rows.filter((row) => row.kind === "player");
  const known = new Set([...knownUserIds, ...players.map((row) => row.user.userId)]);
  const unique = new Map(invitations.map((invitation) => [invitation.userId, invitation]));
  const pending: PendingTablePlace[] = [...unique.values()]
    .filter((invitation) => !known.has(invitation.userId))
    .map((invitation) => ({
      key: invitation.key,
      kind: "pending",
      userId: invitation.userId,
      name: invitation.person?.name || invitation.person?.username || invitation.userId,
      avatarUrl: invitation.person?.avatarUrl ?? null,
    }));
  if (!pending.length) return [...rows];
  const free = rows.filter((row) => row.kind === "empty" && !row.queue).length;
  let replace = Math.min(pending.length, Math.max(0, free - 1));
  const places = rows.filter((row) => {
    if (row.kind === "player") return false;
    // A new intent must not steal an existing reservation or hide the join-queue action.
    if (row.kind === "empty" && !row.queue && replace > 0) {
      replace--;
      return false;
    }
    return true;
  });
  return [...pending, ...players, ...places];
}

/** Explicit self-consent intent, not an accepted participant or a queue position. */
export function pendingParticipationPlaces(
  rows: readonly (EventTablePlace | PendingTablePlace)[],
  intent:
    | { key: string; action: "join" | "accept"; phase?: "saving" | "verifying" | "failed" }
    | undefined,
  userId: string | null | undefined,
  acknowledged: boolean,
  selfProfile?: Pick<UserProfile, "id" | "name" | "avatarUrl">,
): Array<EventTablePlace | PendingTablePlace> {
  if (!intent || !userId || !intent.phase || intent.phase === "failed" || acknowledged)
    return [...rows];
  const own = rows.find((row) => row.kind === "player" && row.user.userId === userId);
  const profile = own?.kind === "player" ? own.user : undefined;
  const self = selfProfile?.id === userId ? selfProfile : undefined;
  return [
    {
      key: intent.key,
      kind: "pending",
      userId,
      action: intent.action,
      phase: intent.phase,
      name: profile?.name || self?.name || profile?.username || "",
      avatarUrl: profile?.avatarUrl ?? self?.avatarUrl ?? null,
    },
    ...rows.filter((row) => row.kind !== "player" || row.user.userId !== userId),
  ];
}
