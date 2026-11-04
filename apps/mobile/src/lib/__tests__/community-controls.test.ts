import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
it("places Community between Groups and Contacts without inventing unread attention", () => {
  const s = source("src/app/(tabs)/_layout.tsx");
  expect(s.indexOf('name="groups"')).toBeLessThan(s.indexOf('name="community"'));
  expect(s.indexOf('name="community"')).toBeLessThan(s.indexOf('name="contacts"'));
  expect(s).not.toContain('section="community"');
  expect(source("src/app/(tabs)/community.tsx")).toContain("<Community");
});
it("uses platform tabs, one virtualized daily list, public identities and separate links", () => {
  const page = source("src/components/community/Community.tsx"),
    feed = source("src/components/community/CommunityActivities.tsx"),
    row = source("src/components/activities/ActivityRow.tsx");
  expect(page).toContain("MainTabBar");
  expect(page).toContain("communityViews");
  expect(page).toContain("useThemeColor");
  expect(feed).toContain("SectionList");
  expect(feed).not.toContain("ScrollView");
  expect(feed).toContain("isFetchNextPageError");
  expect(feed).toContain("activitySections");
  expect(row).not.toContain("UserAvatar");
  expect(row).not.toContain("avatarUrl");
  expect(row).toContain("activityNarrative(item, author");
  expect(row).toContain("id={story.id}");
  expect(row).toContain('accessibilityRole={person.href ? "link" : undefined}');
  expect(feed).toContain("<GroupedList segment={{ index, count: section.data.length }}>");
  expect(feed).not.toContain("insets.bottom + 24, gap:");
  expect(source("src/components/profile/ProfileActivities.tsx")).toContain(
    "<GroupedList segment={{ index, count: rows.length }}>",
  );
  expect(source("src/components/profile/ProfileRecentActivities.tsx")).toContain("<GroupedList>");
  for (const tabs of [page, source("src/components/profile/Profile.tsx")]) {
    const style = tabs.slice(tabs.indexOf("const tabStyle"), tabs.indexOf("export function"));
    expect(style).toContain('flexDirection: "row"');
    expect(style).toContain("minHeight: 44");
    expect(style).not.toContain('flexDirection: "column"');
    expect(tabs).not.toContain("text-xs");
    expect(tabs).not.toContain("sm:text-sm");
  }
  expect(source("src/components/profile/ProfileActivityRow.tsx")).toContain(
    "../activities/ActivityRow",
  );
  expect(source("src/components/events/EventDetail.tsx")).toContain("!event?.readOnly");
});
it("validates manual real-fixture inputs, escaping literal resource text without mocking authentication", () => {
  const script = source(".maestro/helpers/community-inputs.js");
  const base = {
    COMMUNITY_BUILD_ACK: "owned-development-preview-build",
    COMMUNITY_EVENT_ID: "11111111-1111-4111-8111-111111111111",
    COMMUNITY_TABLE_ID: "22222222-2222-4222-8222-222222222222",
    COMMUNITY_TABLE_TEXT: "Table [test]",
    COMMUNITY_VISIBLE_TEXT: "Visible [test]",
    COMMUNITY_FRIEND_TEXT: "Friend",
    COMMUNITY_FOLLOWED_TEXT: "Following",
    COMMUNITY_PRIVATE_TEXT: "private",
    COMMUNITY_BEFORE_TEXT: "before",
  };
  const run = (changes: Partial<Record<string, string>> = {}) => {
    const c = {
      ...base,
      COMMUNITY_LOCALE: "en",
      ...changes,
      output: { community: {} as Record<string, string> },
    };
    runInNewContext(script, c);
    return c.output.community;
  };
  for (const locale of ["en", "it"]) {
    const data = run({ COMMUNITY_LOCALE: locale });
    expect(new RegExp(data.visible).test(base.COMMUNITY_VISIBLE_TEXT)).toBe(true);
    expect(new RegExp(data.tableText).test("Table test")).toBe(false);
    expect(data.eventLink).toContain(base.COMMUNITY_EVENT_ID);
  }
  for (const bad of [
    { COMMUNITY_LOCALE: "bad" },
    { COMMUNITY_BUILD_ACK: "production" },
    { COMMUNITY_TABLE_ID: "bad" },
    { COMMUNITY_EVENT_ID: "" },
    { COMMUNITY_VISIBLE_TEXT: "" },
  ])
    expect(() => run(bad)).toThrow();
});
