import {
  type GroupPersonResponse,
  type NotificationAttentionReceipt,
  type NotificationAttentionSnapshot,
  type NotificationAttentionTarget,
  type NotificationChangesScope,
  type NotificationDto,
  type NotificationListResponse,
  notificationAttentionSnapshotSchema,
  notificationChangesPageSchema,
  notificationItemId,
  type PlannedEventResponse,
} from "@board-game-organizer/schemas";
import {
  attentionMatches,
  attentionReference,
  emptyAttentionSummary,
} from "@board-game-organizer/shared";

export const noticeSnapshotAt = "2030-06-01T10:00:00.000Z";
export const noticeReceiptAt = "2030-06-01T10:03:00.000Z";

/** Owned canonical notices; precise items and change references share the same revision/time. */
export function groupDetailNotices(
  event: PlannedEventResponse,
  first: GroupPersonResponse,
  next: GroupPersonResponse,
) {
  const groupId = event.groupId;
  if (
    !groupId ||
    !first.membership ||
    !next.membership ||
    first.membership.groupId !== groupId ||
    next.membership.groupId !== groupId
  )
    throw new Error("Expected two authorized accepted members of this exact group");
  const memberNotice = (person: GroupPersonResponse, id: string): NotificationDto => {
    if (!person.membership) throw new Error("Expected a canonical membership receipt");
    return {
      id,
      kind: "group_membership_updated",
      title: "Membership updated",
      description: `${person.name}'s membership was updated.`,
      href: `/groups/${groupId}`,
      readAt: null,
      createdAt: person.membership.updatedAt,
      requiresResponse: false,
      attention: {
        target: { kind: "group", id: groupId },
        groupId,
        containers: [{ kind: "group", id: groupId }],
        lists: [{ kind: "group-list", id: "PRIVATE" }],
      },
      attentionItems: [
        {
          id: notificationItemId(groupId, "member", person.userId),
          sectionId: notificationItemId(groupId, "members"),
          revision: person.membership.version,
          changedAt: person.membership.updatedAt,
          readAt: null,
        },
      ],
    };
  };
  const firstNotice = memberNotice(first, "aaaaaaaaaaaaaaaaaaaaaaaa");
  const eventNotice: NotificationDto = {
    id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    kind: "event_updated",
    title: "Event updated",
    description: "The event information was updated.",
    href: `/events/${event.id}`,
    readAt: null,
    createdAt: event.updatedAt,
    requiresResponse: false,
    attention: {
      target: { kind: "event", id: event.id },
      eventId: event.id,
      groupId,
      containers: [{ kind: "event", id: event.id }],
      lists: [
        { kind: "event-list", id: "mine" },
        { kind: "event-list", id: groupId },
      ],
    },
    attentionItems: [
      {
        id: notificationItemId(event.id, "overview"),
        revision: event.version,
        changedAt: event.updatedAt,
        readAt: null,
      },
    ],
  };
  const nextNotice = memberNotice(next, "cccccccccccccccccccccccc");
  return {
    initial: [firstNotice, eventNotice],
    received: [
      {
        ...firstNotice,
        readAt: noticeReceiptAt,
        attentionItems: firstNotice.attentionItems?.map((point) => ({
          ...point,
          readAt: noticeReceiptAt,
        })),
      },
      eventNotice,
      nextNotice,
    ],
    firstNotice,
    nextNotice,
  };
}
function unread(notices: readonly NotificationDto[]) {
  return notices.filter((notice) => !notice.readAt);
}
export function detailAttentionSnapshot(
  notices: readonly NotificationDto[],
  targets: readonly NotificationAttentionTarget[],
  asOf: string,
): NotificationAttentionSnapshot {
  const rows = unread(notices).map((notice) => ({ notice, reference: attentionReference(notice) }));
  const summary = emptyAttentionSummary();
  for (const { reference } of rows) {
    if (reference?.containers?.some((target) => target.kind === "group")) summary.groups++;
    if (reference?.lists?.some((target) => target.kind === "event-list")) summary.events++;
  }
  const unique = [...new Map(targets.map((target) => [JSON.stringify(target), target])).values()];
  return notificationAttentionSnapshotSchema.parse({
    asOf,
    unreadCount: rows.length,
    summary,
    targets: unique.map((target) => {
      const matching = rows.filter(({ reference }) => attentionMatches(reference, target));
      const firstReference = matching[0]?.reference;
      const signals = matching
        .flatMap(({ notice }) =>
          (notice.attentionItems ?? [])
            .filter((point) => !point.readAt)
            .map((point) => `${point.changedAt ?? notice.createdAt}|${notice.id}`),
        )
        .sort();
      return {
        target,
        count: matching.length,
        // Entity direct counts exclude precise attentionItems, matching the repository transport.
        direct:
          target.kind === "item"
            ? matching.length
            : matching.filter(
                ({ notice, reference }) =>
                  !notice.attentionItems &&
                  reference?.target.kind === target.kind &&
                  reference.target.id === target.id,
              ).length,
        events: 0,
        sections: summary.sections,
        ...(target.kind === "item" && signals.length ? { signal: signals.at(-1) } : {}),
        ...(firstReference?.groupId ? { groupId: firstReference.groupId } : {}),
        ...(firstReference?.eventId ? { eventId: firstReference.eventId } : {}),
      };
    }),
  });
}
export function detailChangePage(
  notices: readonly NotificationDto[],
  scope: NotificationChangesScope,
  asOf: string,
) {
  const changes = unread(notices)
    .filter((notice) =>
      attentionReference(notice)?.containers?.some(
        (target) => target.kind === scope.kind && target.id === scope.id,
      ),
    )
    .flatMap((notice) =>
      (notice.attentionItems ?? [])
        .filter((point) => !point.readAt)
        .map((point) => {
          const reference = {
            notificationId: notice.id,
            itemId: point.id,
            revision: point.revision,
            effectiveAt: point.changedAt ?? notice.createdAt,
          };
          return {
            ...reference,
            readReference: reference,
            messageCode:
              notice.kind === "group_membership_updated" ? "member_update" : "information",
            title: notice.title,
            description: notice.description,
            requiresResponse: Boolean(notice.requiresResponse),
          };
        }),
    );
  const members = changes.filter((row) => row.messageCode === "member_update").length;
  return notificationChangesPageSchema.parse({
    asOf,
    changes,
    nextCursor: null,
    tabCounts: { details: changes.length - members, members, tables: 0, participants: 0 },
  });
}
export function detailNoticeList(notices: readonly NotificationDto[]): NotificationListResponse {
  const snapshot = detailAttentionSnapshot(notices, [], noticeReceiptAt);
  return {
    notifications: [...notices],
    unreadCount: snapshot.unreadCount,
    nextCursor: null,
    attention: snapshot.summary,
  };
}
export function detailReadReceipt(
  notices: readonly NotificationDto[],
  targets: readonly NotificationAttentionTarget[],
): NotificationAttentionReceipt {
  return { updated: 1, snapshot: detailAttentionSnapshot(notices, targets, noticeReceiptAt) };
}
