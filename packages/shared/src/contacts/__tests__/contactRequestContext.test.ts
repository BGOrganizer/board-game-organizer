import { expect, it } from "vitest";
import { contactRequestContext } from "../contactRequestContext";
import type { RelationshipRow } from "../hooks/useContacts";

const row = (id: string): RelationshipRow => ({
  fromUserId: "owner",
  toUserId: id,
  profile: {
    id,
    name: id,
    email: null,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: "" },
  },
});

it("keeps unknown requests unknown, ignores missing profiles and prioritizes incoming requests", () => {
  expect(contactRequestContext(undefined, undefined, "target")).toBeUndefined();
  const pending = [
    { rows: [{ ...row("deleted"), profile: null }, row("other")] },
    { rows: [row("target")] },
  ];
  expect(contactRequestContext(pending, [{ rows: [row("target")] }], "target")).toBe("incoming");
  expect(contactRequestContext(pending, [{ rows: [row("sent")] }], "sent")).toBe("outgoing");
  expect(contactRequestContext(pending, [{ rows: [row("sent")] }], "missing")).toBeUndefined();
});

it("stops searching after the first known target without reading later retained pages", () => {
  const unread = {
    get rows(): RelationshipRow[] {
      throw new Error("unneeded page");
    },
  };
  expect(contactRequestContext([{ rows: [row("target")] }, unread], [unread], "target")).toBe(
    "incoming",
  );
  expect(contactRequestContext([], [{ rows: [row("target")] }, unread], "target")).toBe("outgoing");
});
