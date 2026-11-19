import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Source composition policy retained independently of real moderation UI tests.
it("keeps the queue virtualized, access-filtered and aligned with native list/search/loading/empty patterns", () => {
  const source = readFileSync(
    new URL("../../components/groups/GroupModeration.tsx", import.meta.url),
    "utf8",
  );
  for (const token of [
    "<ListPage>",
    "<InputFlatList",
    "<ListSearch",
    "<EmptyList",
    "listPageContentStyle",
    "useSafeAreaInsets",
    'useGroupRecords(o, "moderation", f.search)',
    "communityAccessDenied(q.error) ? [] : q.items",
    "q.isFetchingNextPage",
    't("Could not load moderation queue")',
  ])
    expect(source).toContain(token);
  expect(source).not.toContain("<ScrollView");
  expect(source).not.toContain("<Button.Label>{item.name}");
});
