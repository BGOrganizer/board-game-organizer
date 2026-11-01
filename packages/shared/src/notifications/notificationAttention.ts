import type {
  NotificationAttentionCount,
  NotificationAttentionReference,
  NotificationAttentionSnapshot,
  NotificationAttentionSummary,
  NotificationAttentionTarget,
  NotificationDto,
} from "@board-game-organizer/schemas";

export const attentionKey = (target: NotificationAttentionTarget) => `${target.kind}:${target.id}`;
export function emptyAttentionSummary(): NotificationAttentionSummary {
  return {
    tables: 0,
    events: 0,
    groups: 0,
    contacts: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  };
}
export function attentionReference(
  notification: Pick<NotificationDto, "kind" | "href" | "attention">,
): NotificationAttentionReference | undefined {
  if (notification.attention !== undefined) return notification.attention ?? undefined;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const table = new RegExp(`^/events/(${uuid})/tables/(${uuid})$`, "i").exec(notification.href);
  if (table && /^(event_|table_)/.test(notification.kind))
    return { target: { kind: "table", id: table[2] }, eventId: table[1] };
  const event = new RegExp(`^/events/(${uuid})$`, "i").exec(notification.href);
  if (event && /^(event_|table_)/.test(notification.kind))
    return { target: { kind: "event", id: event[1] }, eventId: event[1] };
  const group = new RegExp(`^/(?:groups|moderation)/(${uuid})$`, "i").exec(notification.href);
  if (group && notification.kind.startsWith("group_"))
    return { target: { kind: "group", id: group[1] }, groupId: group[1] };
  return undefined;
}
export function attentionMatches(
  reference: NotificationAttentionReference | undefined,
  target: NotificationAttentionTarget,
  direct = false,
): boolean {
  if (!reference) return false;
  if (target.kind === "contacts") return reference.section === target.id;
  if (attentionKey(reference.target) === attentionKey(target)) return true;
  if (direct) return false;
  return (
    (target.kind === "event" && reference.eventId === target.id) ||
    (target.kind === "group" && reference.groupId === target.id)
  );
}
export function subtractAttention(
  summary: NotificationAttentionSummary,
  reference: NotificationAttentionReference,
  count: number,
): NotificationAttentionSummary {
  const next = { ...summary, sections: { ...summary.sections } };
  if (reference.target.kind === "table") next.tables = Math.max(0, next.tables - count);
  if (reference.target.kind === "event" || reference.eventId)
    next.events = Math.max(0, next.events - count);
  if (reference.target.kind === "group" || reference.groupId)
    next.groups = Math.max(0, next.groups - count);
  if (reference.target.kind === "contact" || reference.target.kind === "contacts") {
    next.contacts = Math.max(0, next.contacts - count);
    const section =
      reference.section ?? (reference.target.kind === "contacts" ? reference.target.id : undefined);
    if (section) next.sections[section] = Math.max(0, next.sections[section] - count);
  }
  return next;
}
export function projectAttentionSnapshot(
  data: NotificationAttentionSnapshot | undefined,
  reference: NotificationAttentionReference | undefined,
  count: number,
  all = false,
): NotificationAttentionSnapshot | undefined {
  if (!data) return data;
  return {
    ...data,
    unreadCount: all ? 0 : Math.max(0, data.unreadCount - count),
    summary: all
      ? emptyAttentionSummary()
      : reference
        ? subtractAttention(data.summary, reference, count)
        : data.summary,
    targets: data.targets.map((row) => {
      if (all)
        return {
          ...row,
          count: 0,
          direct: 0,
          events: 0,
          sections: { connections: 0, requests: 0, search: 0 },
        };
      if (!reference) return row;
      if (reference.target.kind === "contacts" && row.target.kind === "contact") {
        const n = row.sections[reference.target.id];
        return {
          ...row,
          count: Math.max(0, row.count - n),
          direct: Math.max(0, row.direct - n),
          sections: { ...row.sections, [reference.target.id]: 0 },
        };
      }
      if (!attentionMatches(reference, row.target)) return row;
      const own = attentionKey(reference.target) === attentionKey(row.target);
      const section = reference.section;
      return {
        ...row,
        count: Math.max(0, row.count - count),
        direct:
          own || row.target.kind === "contacts" ? Math.max(0, row.direct - count) : row.direct,
        events:
          row.target.kind === "group" && reference.target.kind !== "group"
            ? Math.max(0, row.events - count)
            : row.events,
        sections: section
          ? { ...row.sections, [section]: Math.max(0, row.sections[section] - count) }
          : row.sections,
      };
    }),
  };
}
export function readReference(row: NotificationAttentionCount): NotificationAttentionReference {
  const kind = row.target.kind;
  return {
    target: row.target,
    eventId: kind === "table" ? row.eventId : kind === "event" ? row.target.id : undefined,
    groupId:
      kind === "table" || kind === "event"
        ? row.groupId
        : kind === "group"
          ? row.target.id
          : undefined,
    section: kind === "contacts" ? row.target.id : kind === "contact" ? row.section : undefined,
  };
}
