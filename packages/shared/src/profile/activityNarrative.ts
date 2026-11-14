import type { ActivityAuthor, ProfileActivity } from "@board-game-organizer/schemas";

const messages = {
  follower: "<actor/> started following <target/>.",
  friendship: "<actor/> became friends with <target/>.",
  played: "<actor/> played at table <target/>.",
  won: "<actor/> played and won at table <target/>.",
  table_join: "<actor/> joined table <target/>.",
  event_join: "<actor/> joined event <target/>.",
  group_join: "<actor/> is now part of group <target/>.",
  milestone:
    "<actor/> reached {count, plural, one {# victory} other {# victories}} at table <target/>.",
  milestoneUnknown: "<actor/> reached a victory milestone at table <target/>.",
} as const;

/** A follower receipt belongs to the followee, not to the actor who followed. */
export function activityNarrative(
  item: ProfileActivity,
  author: ActivityAuthor | undefined,
  unknownUser: string,
  unknownSource: string,
  viewer?: { id: string | null | undefined; name: string },
) {
  const subject = author ?? item.author;
  const owner = {
    name: subject?.username || subject?.name || unknownUser,
    href: subject ? `/profiles/${encodeURIComponent(subject.id)}` : null,
  };
  const resource = {
    name:
      item.context ||
      (item.kind === "follower" || item.kind === "friendship" ? unknownUser : unknownSource),
    href: item.href,
  };
  const key =
    item.kind === "played" && item.outcome === "won"
      ? "won"
      : item.kind === "milestone" && item.milestone === undefined
        ? "milestoneUnknown"
        : item.kind;
  const actorId = item.kind === "follower" ? item.otherUserId : subject?.id;
  const targetId =
    item.kind === "follower"
      ? subject?.id
      : item.kind === "friendship"
        ? item.otherUserId
        : undefined;
  const self = { name: viewer?.name ?? unknownUser, href: null };
  const selfActor = Boolean(viewer?.id && actorId === viewer.id);
  const selfTarget = Boolean(viewer?.id && targetId === viewer.id);
  return {
    id: selfActor
      ? `activity.self.${key}`
      : selfTarget && item.kind === "follower"
        ? "activity.followed-you"
        : selfTarget && item.kind === "friendship"
          ? "activity.friends-with-you"
          : messages[key],
    actor: selfActor ? self : item.kind === "follower" ? resource : owner,
    target: selfTarget ? self : item.kind === "follower" ? owner : resource,
    count: item.milestone,
  };
}
