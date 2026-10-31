import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
it("uses consent responses and queue/seat states, never approval actions on spontaneous table joins", () => {
  const card = source("events/EventTableCard") + source("events/EventTableInvitationActions"),
    table = source("events/EventTableOverview") + source("events/EventTableSeats");
  expect(card).toContain("setAccepting(true)");
  expect(card).toContain("<EventJoinSheet");
  expect(card).toContain("registrationId={registration.id}");
  expect(card).not.toContain('action: "accept"');
  expect(card).toContain('action: "decline"');
  expect(card).toContain('registration.status !== "PENDING"');
  expect(card).toContain('registration.kind !== "INVITATION"');
  expect(card).toContain("<InvitationActions");
  expect(card).toContain("registration.version");
  expect(table).toContain("<EventJoinSheet");
  expect(source("events/EventJoinSheet")).toContain("form.submit()");
  expect(table).not.toContain('action:"approve"');
  expect(table).toContain("Pending invitations");
  expect(table).toContain("Waiting list");
});
it("keeps leave/removal destructive, confirmed and target-pending-disabled; view permissions remain server capabilities", () => {
  const table = source("events/EventTableOverview") + source("events/EventTableSeats");
  for (const token of [
    "canLeave",
    "canInvite",
    "<ConfirmDialog",
    'variant: "danger"',
    "busy={a.blocking || a.isResponding(confirm.registrationId)}",
    "a.respond.mutate(",
  ])
    expect(table).toContain(token);
  expect(table).toMatch(/version:\s*confirm\.version/);
  expect(source("events/EventInvitationPicker")).toContain("event.canInvite");
});
it("uses grouped games, virtualized user places, avatar badges and one explicit preference chooser", () => {
  const table = source("events/EventTableOverview"),
    roster = source("events/EventTableSeats"),
    vote = source("events/EventVoteButtons");
  expect(table).not.toContain("<EventTableCard");
  expect(table).toMatch(/<GroupedList>[\s\S]*<GameListRow/);
  expect(table).toContain("metadata=");
  expect(table).toContain("<EventVoteCounts");
  expect(roster).toContain("<SectionList");
  expect(roster).toContain("stickySectionHeadersEnabled={false}");
  expect(roster).toContain("roster.waitingRows");
  expect(roster).toContain("<UserListRow");
  expect(roster).toContain("<AddUserRow");
  expect(roster).toContain("badge={{");
  expect(roster).toContain('t("Seats list")');
  expect(roster).toContain("<IconLegend");
  expect(vote).toContain('variant="secondary"');
  expect(vote).toContain("<ConfirmDialog");
  expect(vote).toContain('"success"');
  expect(vote).toContain('"warning"');
  expect(vote).toContain('"danger"');
});
it("keeps Group request states after Overview and uses inline searchable Select instead of a Group screen", () => {
  const detail = source("groups/GroupDetail"),
    request = source("groups/GroupJoinRequest"),
    select = source("events/EventGroupSelect");
  expect(detail.indexOf("<GroupJoinRequest")).toBeGreaterThan(detail.indexOf("<GroupDetailsCard"));
  expect(request).toContain('alignItems: "center"');
  expect(request).toContain('textAlign: "center"');
  expect(request).toContain("<UserRoundPlus");
  expect(request).toContain("<X");
  expect(select).toContain("<Select");
  expect(select).toContain("<FlatList");
  expect(select).toContain("<SearchInput");
  expect(select).toContain("<GroupArtwork");
  expect(select).toContain("isDisabled={busy || locked}");
  expect(select).toContain('value="none"');
  expect(source("events/EventWizard")).not.toContain('pick === "group"');
  const members = source("groups/GroupMembers");
  expect(members).toContain("icon: <Check");
  expect(members).toContain("icon: <X");
});
it("keeps social blocking separate from group exclusions and prevents pending group social controls", () => {
  const members = source("groups/GroupMembers");
  expect(members).toContain("group.canSocialInteract");
  expect(members).toContain("GroupBanDialog");
  expect(source("groups/GroupBanDialog")).toContain("global blocking");
  expect(source("groups/GroupDetail")).toContain("<GroupJoinRequest");
  expect(source("groups/GroupJoinRequest")).toContain("Membership pending.");
});
