import type { CommunityActivity } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import {
  ACTIVITY_FEED_POLICY,
  activityDay,
  activitySections,
  activityVisibilityVerified,
  isRetiredActivityFeed,
  optimisticNetworkActivities,
} from "../activityFeed";

const item = (
  id: string,
  occurredAt: string,
  author = "friend",
  otherUserId?: string,
): CommunityActivity => ({
  id,
  occurredAt,
  author: { id: author, name: author, username: null, avatarUrl: null },
  kind: "friendship",
  context: "Friend",
  href: "/profiles/friend",
  otherUserId,
});
it("rejects pre-policy or inconsistent source visibility without inventing permission from cached membership", () => {
  const base = { items: [item("a", "2030-01-01T00:00:00.000Z")], nextCursor: null };
  expect(activityVisibilityVerified(base)).toBe(false);
  expect(
    activityVisibilityVerified({
      ...base,
      items: [{ ...base.items[0], visibility: "authorized" }],
    }),
  ).toBe(true);
  expect(
    activityVisibilityVerified({
      ...base,
      items: [{ ...base.items[0], visibility: "public-group", groupId: "public" }],
    }),
  ).toBe(true);
  expect(
    activityVisibilityVerified({
      ...base,
      items: [{ ...base.items[0], visibility: "authorized", groupId: "private" }],
    }),
  ).toBe(false);
});
it("versions only activity caches, retaining unrelated private data", () => {
  expect(isRetiredActivityFeed(["events"])).toBe(false);
  expect(isRetiredActivityFeed(["profile", "api", "me", "view"])).toBe(false);
  expect(isRetiredActivityFeed(["profile", "api", "me", "activities", "friend"])).toBe(true);
  expect(
    isRetiredActivityFeed(["profile", "api", "me", "network", "all", ACTIVITY_FEED_POLICY]),
  ).toBe(false);
  expect(
    isRetiredActivityFeed(["profile", "api", "me", "activities", "friend", ACTIVITY_FEED_POLICY]),
  ).toBe(false);
});
it("groups local calendar days, yesterday across month/year boundaries and localized dated headings", () => {
  const now = new Date(2030, 0, 1, 12),
    today = new Date(2030, 0, 1, 9).toISOString(),
    yesterday = new Date(2029, 11, 31, 23).toISOString(),
    older = new Date(2029, 11, 29, 12).toISOString();
  expect(activityDay(today, "en", "Today", "Yesterday", now).label).toBe("Today");
  expect(activityDay(yesterday, "it", "Oggi", "Ieri", now).label).toBe("Ieri");
  expect(activityDay(older, "it", "Oggi", "Ieri", now).label).toContain("2029");
  expect(
    activityDay(new Date(2030, 0, 2).toISOString(), "en", "Today", "Yesterday", now).label,
  ).not.toContain("2030");
  expect(
    activitySections(
      [item("1", today), item("2", today), item("3", yesterday)],
      "en",
      "Today",
      "Yesterday",
      now,
    ).map((s) => [s.title, s.data.length]),
  ).toEqual([
    ["Today", 2],
    ["Yesterday", 1],
  ]);
  expect(activitySections([], "en", "Today", "Yesterday")).toEqual([]);
});
it("removes only affected actors/blocked social targets and never fabricates an activity for a follow", () => {
  const at = "2030-01-01T00:00:00.000Z",
    data = {
      pages: [
        { items: [item("1", at), item("2", at, "other", "friend"), item("3", at, "safe")] },
        {},
      ],
    };
  for (const action of ["unfollow", "unfriend"])
    expect(
      (optimisticNetworkActivities(data, action, "friend") as typeof data).pages[0].items?.map(
        (i) => i.id,
      ),
    ).toEqual(["2", "3"]);
  expect(
    (optimisticNetworkActivities(data, "block", "friend") as typeof data).pages[0].items?.map(
      (i) => i.id,
    ),
  ).toEqual(["3"]);
  for (const input of [null, 3, {}, { pages: 2 }, data])
    expect(optimisticNetworkActivities(input, "follow", "friend")).toBe(input);
  expect(optimisticNetworkActivities({}, "block", "friend")).toEqual({});
  expect(optimisticNetworkActivities({ pages: 2 }, "block", "friend")).toEqual({ pages: 2 });
  expect(optimisticNetworkActivities(3, "block", "friend")).toBe(3);
});
