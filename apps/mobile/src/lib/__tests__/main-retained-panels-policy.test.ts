import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Source architecture policy only. Runtime retention and paging behavior belongs
// to the actual native GroupsMainLists, EventsMainLists and CommunityMainLists suites.
it.each(["groups/Groups", "events/Events", "community/Community"])(
  "%s keeps main-tab selection synchronous rather than deferring its owner tree",
  (path) => {
    const source = readFileSync(new URL(`../../components/${path}.tsx`, import.meta.url), "utf8");
    expect(source).not.toContain("useDeferredValue");
  },
);
