import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
it("uses consent responses and queue/seat states, never approval actions on spontaneous table joins", () => {
  const card = source("events/EventTableCard"),
    table = source("events/EventTable");
  expect(card).toMatch(/action:\s*"accept"/);
  expect(card).toMatch(/action:\s*"decline"/);
  expect(card).toContain("registration.version");
  expect(table).toContain("a.register.mutate");
  expect(table).not.toContain('action:"approve"');
  expect(table).toContain("Pending invitations");
  expect(table).toContain("Waiting list");
});
it("keeps leave/removal destructive, confirmed and pending-disabled; view permissions remain server capabilities", () => {
  const table = source("events/EventTable");
  for (const token of [
    "canLeave",
    "canInvite",
    "<ConfirmDialog",
    'variant: "danger"',
    "busy={a.busy}",
    "Could not update table registration",
  ])
    expect(table).toContain(token);
  expect(table).toMatch(/version:\s*confirm\.version/);
  expect(source("events/EventInvitationPicker")).toContain("event.canInvite");
});
it("keeps social blocking separate from group exclusions and prevents pending group social controls", () => {
  const members = source("groups/GroupMembers");
  expect(members).toContain("group.canSocialInteract");
  expect(members).toContain("GroupBanDialog");
  expect(source("groups/GroupBanDialog")).toContain("global blocking");
  expect(source("groups/GroupDetail")).toContain("Membership pending.");
});
