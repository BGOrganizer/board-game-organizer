import type { InviteClaimResponse, TableInviteReviewResponse } from "@board-game-organizer/schemas";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
export const inviteToken = "abcdefghijklmnopqrstuv";
export const inviteGroupId = "99999999-9999-4999-8999-999999999999";
export function tableInviteReview(
  change: Partial<TableInviteReviewResponse> = {},
): TableInviteReviewResponse {
  return {
    kind: "TABLE",
    expiresAt: "2030-06-08T12:00:00Z",
    inviter: { id: "inviter", name: "Inviting Player", username: "@inviter", avatarUrl: null },
    group: { id: inviteGroupId, name: "Private games group" },
    event: {
      id: plannedEvent.id,
      name: plannedEvent.name,
      version: 1,
      timeZone: plannedEvent.timeZone,
      startTime: plannedEvent.startTime,
      dates: plannedEvent.dates,
      locations: plannedEvent.locations,
      planningMode: "ASSISTED",
      playerPreference: "MORE_PLAYERS",
    },
    table: {
      id: plannedTable.id,
      name: plannedTable.name,
      minPlayers: 2,
      maxPlayers: 4,
      games: plannedTable.games,
      rankingEnabled: true,
      gamesDetail: plannedTable.gamesDetail,
    },
    requiresAvailability: true,
    ownAvailability: null,
    ownRegistration: null,
    ...change,
  };
}
export function tableClaimReceipt(position: "SEATED" | "WAITING" = "SEATED"): InviteClaimResponse {
  const review = tableInviteReview();
  return {
    success: true,
    inviter: {
      id: "inviter",
      name: "Inviting Player",
      email: "inviter@example.test",
      avatarUrl: null,
    },
    table: {
      groupId: review.group.id,
      eventId: review.event.id,
      tableId: review.table.id,
      position,
    },
  };
}
export function multipleInviteOptions(): TableInviteReviewResponse {
  const review = tableInviteReview();
  return {
    ...review,
    event: {
      ...review.event,
      dates: [
        ...review.event.dates,
        { id: "44444444-4444-4444-8444-444444444444", day: "2030-06-04" },
      ],
      locations: [
        ...review.event.locations,
        {
          ...review.event.locations[0],
          id: "55555555-5555-4555-8555-555555555555",
          name: "Second club",
        },
      ],
    },
    table: {
      ...review.table,
      games: [...review.table.games, { gameId: 2, durationMinutes: 30 }],
      gamesDetail: [
        ...review.table.gamesDetail,
        { id: 2, name: "Second game", imageUrl: null, year: null },
      ],
    },
  };
}
