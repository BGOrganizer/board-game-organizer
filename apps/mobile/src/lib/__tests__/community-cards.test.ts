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
  const s = source("events/EventTableCard") + source("events/EventTableInvitationActions");
  expect(s).toContain("myRegistration");
  expect(s).toContain("Accept invitation");
  expect(s).toContain("Decline invitation");
  expect(s).toMatch(/version:\s*registration\.version/);
  expect(s).toContain("Waiting list");
  expect(s).toContain("Pending");
  expect(s).toContain("winners.map");
  expect(s).not.toContain('kind:"approve"');
});
it("keeps personal Table metadata/counts compact and puts pending type badges on artwork for Tables and Groups", () => {
  const table = source("events/EventTableCard");
  expect(table).toContain("<CalendarDays");
  expect(table).not.toContain("<EventStatusBadge status={table.eventStatus}");
  expect(table).toContain("StatusIcon");
  expect(table).toContain('t("Winners")');
  expect(table).toContain("table.demonstratorUserId");
  expect(table).toContain("<Presentation");
  expect(table).toContain("leadingActions=");
  expect(table).toContain('variant="planets"');
  expect(table).toContain("table.groupName");
  expect(table).toContain("<UsersRound");
  for (const token of [
    "UserRoundMinus",
    "UserRoundPlus",
    "UserRoundCheck",
    "Clock3",
    "ListOrdered",
    "table.waitingCount",
    "table.acceptedCount",
    "table.pendingRegistrationCount",
  ])
    expect(table).toContain(token);
  expect(table).toContain("horizontal");
  expect(table).not.toContain('t("Reserved place")');
  expect(table).not.toMatch(/<Typography[^>]*>\s*\{t\("Invitation received"\)\}/);
  expect(table).toContain('registration?.status === "PENDING"');
  expect(table).toContain("<PendingArtworkBadge");
  const group = source("groups/GroupArtwork");
  expect(group).toContain('group.role === "invited"');
  expect(group).toContain('group.role === "requested"');
  expect(group).toContain("<PendingArtworkBadge");
  const badge = source("common/ui/PendingArtworkBadge");
  expect(badge).toContain('useThemeColor("warning")');
  expect(badge).toContain("right: 0");
  expect(badge).toContain("bottom: 0");
  expect(badge).toContain('kind === "invitation" ? Mail : Clock3');
});
it("shares native invitation dimensions, semantic variants and icons between Group and Table cards", () => {
  expect(source("events/EventTableInvitationActions")).toContain("<InvitationActions");
  expect(source("groups/GroupCard")).toContain("<InvitationActions");
  const actions = source("common/ui/InvitationActions");
  expect(actions).toContain('variant="primary"');
  expect(actions).toContain('variant="danger-soft"');
  expect(actions).toContain("width: 36, height: 36, minWidth: 36, minHeight: 36");
  expect(actions).toContain("hitSlop={4}");
  expect(actions).toContain("<Check size={14}");
  expect(actions).toContain("<X size={14}");
  expect(actions).not.toContain("#6b7280");
  expect(actions).not.toContain("#fff");
});
it("keeps group type/moderation artwork distinct and group creator protected", () => {
  expect(source("groups/GroupCard")).toContain("GroupArtwork");
  expect(source("groups/GroupDetailsCard")).toContain("PUBLIC");
  expect(source("groups/GroupMembers")).toContain("isAdmin");
});
