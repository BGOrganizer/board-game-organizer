import { expect, it } from "vitest";
import { eventRecordVisibility } from "../eventRecordVisibility";

it.each([
  [undefined, "PUBLIC", "PUBLIC"],
  ["PUBLIC", "PUBLIC", "PUBLIC"],
  ["PRIVATE", "PUBLIC", "PRIVATE"],
  [undefined, "PRIVATE", "PRIVATE"],
  ["PUBLIC", "PRIVATE", "PRIVATE"],
  ["PRIVATE", "PRIVATE", "PRIVATE"],
  [undefined, null, "PRIVATE"],
  ["PUBLIC", null, "PRIVATE"],
  ["PRIVATE", null, "PRIVATE"],
] as const)(
  "resolves visibility %s in Group %s as %s without widening legacy access",
  (visibility, group, expected) => {
    expect(eventRecordVisibility({ visibility }, group)).toBe(expected);
  },
);
