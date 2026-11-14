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
  notification: Pick<NotificationDto, "kind" | "href" | "attention" | "attentionItems">,
): NotificationAttentionReference | undefined {
  if (notification.attention !== undefined) {
    if (!notification.attention) return undefined;
    if (!notification.attentionItems?.length) return notification.attention;
    const reference = notification.attention;
    const allowed = reference.containers ?? [
      reference.target,
      ...(reference.tableIds ?? []).map((id) => ({ kind: "table" as const, id })),
      ...(reference.eventId ? [{ kind: "event" as const, id: reference.eventId }] : []),
      ...(reference.groupId ? [{ kind: "group" as const, id: reference.groupId }] : []),
    ];
    const containers: NotificationAttentionTarget[] = [];
    for (const item of notification.attentionItems.filter((item) => !item.readAt)) {
      try {
        const [kind, id] = JSON.parse(item.id) as ["event" | "table" | "group", string];
        const target = allowed.find((value) => value.kind === kind && value.id === id);
        if (target && !containers.some((value) => attentionKey(value) === attentionKey(target)))
          containers.push(target);
      } catch {
        /* Malformed historical metadata never grants a container. */
      }
    }
    return {
      ...reference,
      containers,
      ...(reference.lists
        ? {
            lists: reference.lists.filter((list) =>
              containers.some(
                (owner) => owner.kind === (list.kind === "event-list" ? "event" : "group"),
              ),
            ),
          }
        : {}),
      itemIds: [
        ...new Set(
          notification.attentionItems
            .filter((item) => !item.readAt)
            .flatMap((item) => [item.id, ...(item.sectionId ? [item.sectionId] : [])]),
        ),
      ],
    };
  }
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
  if (target.kind === "event-list" || target.kind === "group-list")
    return (
      !direct &&
      Boolean(reference.lists?.some((list) => attentionKey(list) === attentionKey(target)))
    );
  if (target.kind === "contacts") return reference.section === target.id;
  if (target.kind === "item")
    return (
      attentionKey(reference.target) === attentionKey(target) ||
      Boolean(reference.itemIds?.includes(target.id))
    );
  const containers = reference.containers ?? [reference.target];
  if (direct && !reference.containers)
    return attentionKey(reference.target) === attentionKey(target);
  return containers.some((value) => attentionKey(value) === attentionKey(target));
}
export function subtractAttention(
  summary: NotificationAttentionSummary,
  reference: NotificationAttentionReference,
  count: number,
): NotificationAttentionSummary {
  const next = { ...summary, sections: { ...summary.sections } };
  const containers = reference.containers ?? [reference.target];
  if (containers.some((value) => value.kind === "table"))
    next.tables = Math.max(0, next.tables - count);
  if (containers.some((value) => value.kind === "event"))
    next.events = Math.max(0, next.events - count);
  if (containers.some((value) => value.kind === "group"))
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
          row.target.kind === "item" ||
          (!reference.itemIds?.length && (own || row.target.kind === "contacts"))
            ? Math.max(0, row.direct - count)
            : row.direct,
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
    ...(row.containers ? { containers: row.containers } : {}),
    ...(row.lists ? { lists: row.lists } : {}),
    ...(row.tableIds ? { tableIds: row.tableIds } : {}),
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
