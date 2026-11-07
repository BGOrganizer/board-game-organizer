import type { CommunityActivity, ProfileActivityPage } from "@board-game-organizer/schemas";

/** Separate old private-source snapshots from the explicit public-group feed policy. */
export const ACTIVITY_FEED_POLICY = "public-v1";
/** Old API responses must not repopulate a new-policy cache with formerly private activities. */
export function activityVisibilityVerified(page: ProfileActivityPage) {
  return page.items.every(
    (item) => item.visibility === (item.groupId ? "public-group" : "authorized"),
  );
}
export function isRetiredActivityFeed(key: readonly unknown[]) {
  return (
    key[0] === "profile" &&
    (key[3] === "activities" || key[3] === "network") &&
    key.at(-1) !== ACTIVITY_FEED_POLICY
  );
}
export function activityDay(
  instant: string,
  locale: string,
  today: string,
  yesterday: string,
  now = new Date(),
) {
  const date = new Date(instant),
    previous = new Date(now);
  previous.setDate(previous.getDate() - 1);
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  return {
    key,
    label:
      date.toDateString() === now.toDateString()
        ? today
        : date.toDateString() === previous.toDateString()
          ? yesterday
          : new Intl.DateTimeFormat(locale, {
              day: "numeric",
              month: "long",
              ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
            }).format(date),
  };
}
export function activitySections(
  rows: readonly CommunityActivity[],
  locale: string,
  today: string,
  yesterday: string,
  now = new Date(),
) {
  const sections: Array<{ key: string; title: string; data: CommunityActivity[] }> = [];
  for (const item of rows) {
    const day = activityDay(item.occurredAt, locale, today, yesterday, now);
    let section = sections.at(-1);
    if (!section || section.key !== day.key) {
      section = { key: day.key, title: day.label, data: [] };
      sections.push(section);
    }
    section.data.push(item);
  }
  return sections;
}

/** Remove affected authors on destructive social intents; additions wait for server receipts/cutoffs. */
export function optimisticNetworkActivities(
  data: unknown,
  action: string,
  target: string,
): unknown {
  if (
    !data ||
    typeof data !== "object" ||
    !["block", "unfollow", "unfriend"].includes(action) ||
    !("pages" in data) ||
    !Array.isArray(data.pages)
  )
    return data;
  return {
    ...data,
    pages: data.pages.map((page: { items?: CommunityActivity[] }) => ({
      ...page,
      items: page.items?.filter(
        (item) => item.author.id !== target && (action !== "block" || item.otherUserId !== target),
      ),
    })),
  };
}
