import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
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
  const s =
    source("events/EventTableCardIndicators") + source("events/EventTableInvitationActions");
  expect(s).toContain("myRegistration");
  expect(s).toContain("Accept invitation");
  expect(s).toContain("Decline invitation");
  expect(s).toMatch(/version:\s*registration\.version/);
  expect(s).toContain("Waiting list");
  expect(s).toContain("Pending");
  expect(s).toContain("winners.map");
  expect(s).not.toContain('kind:"approve"');
});
it("keeps compact cumulative Table icons at bottom right beside full-height left artwork", () => {
  const table = source("events/EventTableCard") + source("events/EventTableCardIndicators");
  expect(table).toContain("<CalendarDays");
  expect(table).not.toContain("<EventStatusBadge status={table.eventStatus}");
  expect(table).toContain("tableParticipation(table.myRegistration, table.myPosition)");
  expect(table).toContain("<ArtworkStatusPopover");
  expect(table).toContain('t("Winners")');
  expect(table).toContain("table.demonstratorUserId");
  expect(table).toContain('kind="demonstrator"');
  expect(table).toContain("leadingActions=");
  expect(table).toContain('variant="planets"');
  expect(table).toContain("table.groupName");
  expect(table).toContain("<UsersRound");
  for (const token of [
    't("Minimum players")',
    't("Maximum players")',
    't("Accepted players")',
    't("Waiting list")',
    't("Pending players")',
    "table.waitingCount",
    "table.acceptedCount",
    "table.pendingRegistrationCount",
  ])
    expect(table).toContain(token);
  expect(table).toContain('flexWrap: "wrap"');
  expect(table).toContain("<EventTableGamesPopover");
  expect(table).not.toContain('t("Reserved place")');
  expect(table).not.toMatch(/<Typography[^>]*>\s*\{t\("Invitation received"\)\}/);
  expect(table).not.toContain("<PendingArtworkBadge");
  const card = source("common/ui/LinkedListCard");
  expect(card).toContain("<Card.Body");
  expect(card).toContain("{artwork}");
  expect(card).not.toContain("top: 80");
  expect(card).toContain('alignItems: "center"');
  const status = source("common/ui/ArtworkStatusPopover");
  expect(status).toContain("<HelpPopover");
  expect(status).toContain("icon: Mail");
  expect(status).toContain("icon: Clock3");
  expect(source("groups/GroupCard")).toContain('status="none"');
  const group = source("groups/GroupArtwork");
  expect(group).toContain('group.role === "invited"');
  expect(group).toContain('group.role === "requested"');
  expect(group).toContain("<PendingArtworkBadge");
  expect(group).toContain("seed={group.id}");
  expect(group).not.toContain("seed={group.name}");
  const badge = source("common/ui/PendingArtworkBadge");
  expect(badge).toContain('useThemeColor("warning")');
  expect(badge).toContain("right: 0");
  expect(badge).toContain("bottom: 0");
  expect(badge).toContain('kind === "invitation" ? Mail : Clock3');
});
it("keeps shared invitation dimensions and semantic controls in details, never list cards", () => {
  expect(source("events/EventTableInvitationActions")).toContain("<InvitationActions");
  expect(source("groups/GroupCard")).not.toContain("<InvitationActions");
  expect(source("events/EventTableCard")).not.toContain("<EventTableInvitationActions");
  expect(source("groups/GroupInvitationCard")).toContain("onPress={onAccept}");
  expect(source("groups/GroupInvitationCard")).toContain("onPress={onDecline}");
  expect(source("events/EventTableSeats")).toContain("<EventTableInvitationActions");
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
it.each([
  ["admin", "admin"],
  ["invited", "invitation"],
  ["requested", "request"],
  ["accepted", "member"],
  ["none", null],
])("projects authoritative Group role %s to %s without granting membership", (role, expected) => {
  const value = source("groups/GroupCard").match(/const indicator =([\s\S]*?);/)?.[1];
  expect(value).toBeTruthy();
  expect(runInNewContext(`(${value})`, { group: { role } })).toBe(expected);
  const status = source("common/ui/ArtworkStatusPopover");
  expect(status).toContain('t("Group member")');
  expect(status).toContain('t("You are a member of this group.")');
  expect(status).toMatch(/kind === "member"\s*\|\|\s*kind === "accepted"\s*\?\s*"success"/);
});
it("keeps group type/moderation artwork distinct and group creator protected", () => {
  expect(source("groups/GroupCard")).toContain("GroupArtwork");
  expect(source("groups/GroupDetailsCard")).toContain("PUBLIC");
  expect(source("groups/GroupMembers")).toContain("isAdmin");
});
