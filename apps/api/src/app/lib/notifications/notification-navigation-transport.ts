import type {
  NotificationAttentionCount,
  NotificationAttentionReceipt,
  NotificationAttentionReference,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
  NotificationChangesReceipt,
  NotificationListResponse,
} from "@board-game-organizer/schemas";

type ReadEffect = NonNullable<NotificationAttentionCount["readEffect"]>;
type Reply =
  | NotificationAttentionSnapshot
  | NotificationAttentionReceipt
  | NotificationChangesReceipt
  | NotificationListResponse;

function legacyTarget<T extends NotificationAttentionTarget>(target: T): T {
  return target.kind === "event-list" && target.id === "terminated"
    ? { ...target, id: "mine" }
    : target;
}

function legacyEffect<T extends ReadEffect>(effect: T): T {
  const targets = new Map<string, ReadEffect["targets"][number]>();
  for (const row of effect.targets) {
    const target = legacyTarget(row.target);
    const key = `${target.kind}:${target.id}`;
    const previous = targets.get(key);
    targets.set(
      key,
      previous
        ? {
            ...previous,
            count: previous.count + row.count,
            direct: previous.direct + row.direct,
            events: previous.events + row.events,
          }
        : { ...row, target },
    );
  }
  return { ...effect, targets: [...targets.values()] };
}

function legacyReference<T extends NotificationAttentionReference & { readEffect?: ReadEffect }>(
  reference: T,
): T {
  const { historyTableIds: _historyTableIds, ...legacy } = reference;
  return {
    ...legacy,
    target: legacyTarget(reference.target),
    ...(reference.lists
      ? {
          lists: [
            ...new Map(
              reference.lists.map((row) => {
                const target = legacyTarget(row);
                return [`${target.kind}:${target.id}`, target];
              }),
            ).values(),
          ],
        }
      : {}),
    ...(reference.readEffect ? { readEffect: legacyEffect(reference.readEffect) } : {}),
  } as T;
}

function legacySnapshot<T extends NotificationAttentionSnapshot>(snapshot: T): T {
  return { ...snapshot, targets: snapshot.targets.map(legacyReference) };
}

/** Project sanitized notification DTOs only. Authority and counter calculations stay at source. */
export function notificationNavigationReply<T extends Reply>(reply: T, navigation?: "history"): T {
  if (navigation === "history") return reply;
  if ("notifications" in reply)
    return {
      ...reply,
      notifications: reply.notifications.map((row) => ({
        ...row,
        attention: row.attention ? legacyReference(row.attention) : row.attention,
      })),
    } as T;
  if ("targets" in reply) return legacySnapshot(reply) as T;
  return {
    ...reply,
    snapshot: legacySnapshot(reply.snapshot),
    ...("effects" in reply ? { effects: legacyEffect(reply.effects) } : {}),
  };
}
