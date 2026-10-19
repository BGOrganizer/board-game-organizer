import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
it.each(["groups/GroupCard", "events/EventCard", "events/EventTableCard"])(
  "uses accessible platform-owned linked cards for %s",
  (file) => {
    const s = source(file);
    expect(s).toContain("<LinkedListCard");
    expect(s).toContain("<ListCardBody");
    expect(s).toContain("label=");
  },
);
it("preserves invitation consent and reserved/waiting distinctions without inventing accepted players", () => {
  const s = source("events/EventTableCard");
  expect(s).toContain("myRegistration");
  expect(s).toContain("Accept invitation");
  expect(s).toContain("Decline invitation");
  expect(s).toMatch(/version:\s*registration\.version/);
  expect(s).toContain("Waiting list");
  expect(s).toContain("Pending");
  expect(s).toContain("winners.map");
  expect(s).not.toContain('kind:"approve"');
});
it("keeps group type/moderation artwork distinct and group creator protected", () => {
  expect(source("groups/GroupCard")).toContain("GroupArtwork");
  expect(source("groups/GroupDetailsCard")).toContain("PUBLIC");
  expect(source("groups/GroupMembers")).toContain("isAdmin");
});
