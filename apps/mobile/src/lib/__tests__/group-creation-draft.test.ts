import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

// Executes the actual draft callbacks, not React Native layout or device touch acceptance.
const source = readFileSync(
  new URL("../../components/groups/GroupWizard.tsx", import.meta.url),
  "utf8",
);
const visibility = source.match(/const changeVisibility = [\s\S]*?=> \{([\s\S]*?)\n {2}\};/)?.[1];
const receive = source.match(
  /useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[pendingUser, pickerSlot, clearPending, type, group, submitting\]\)/,
)?.[1];
const choose = source.match(/const chooseFriend = \(\) => \{([\s\S]*?)\n {2}\};/)?.[1];
function draft(overrides: Record<string, unknown> = {}) {
  let friends = [{ id: "selected" }];
  const scope = {
    type: "PRIVATE",
    group: undefined,
    submitting: false,
    uploading: false,
    pickerSlot: "current",
    pendingUser: { slotId: "current", user: { id: "new" } },
    friends,
    clearPending: vi.fn(),
    setPickerSlot: vi.fn(),
    setType: vi.fn(),
    setFriends: vi.fn((next: typeof friends | ((value: typeof friends) => typeof friends)) => {
      friends = typeof next === "function" ? next(friends) : next;
    }),
    router: { push: vi.fn() },
    ...overrides,
  };
  return { scope, friends: () => friends };
}
it.each(["PRIVATE", "PUBLIC"])(
  "resets invites and picker generation when changing from %s",
  (type) => {
    expect(visibility).toBeTruthy();
    const d = draft({ type });
    const change = runInNewContext(`value => {${visibility}}`, d.scope);
    const next = type === "PRIVATE" ? "PUBLIC" : "PRIVATE";
    change(next);
    expect(d.scope.setType).toHaveBeenCalledWith(next);
    expect(d.friends()).toEqual([]);
    expect(d.scope.clearPending).toHaveBeenCalledOnce();
    expect(d.scope.setPickerSlot).toHaveBeenCalledOnce();
    expect(d.scope.setPickerSlot.mock.calls[0][0]).not.toBe("current");
  },
);
it.each([{ type: "PRIVATE" }, { group: {} }, { submitting: true }])(
  "does not clear friends on an unchanged/locked choice %j",
  (fields) => {
    const d = draft(fields);
    const change = runInNewContext(`value => {${visibility}}`, d.scope);
    change(fields.type ?? "PUBLIC");
    expect(d.scope.setType).not.toHaveBeenCalled();
    expect(d.friends()).toEqual([{ id: "selected" }]);
  },
);
it.each([
  { type: "PUBLIC" },
  { group: {} },
  { submitting: true },
  { pendingUser: { slotId: "old", user: { id: "late" } } },
])("rejects pending picker results outside the current editable private draft %j", (fields) => {
  expect(receive).toBeTruthy();
  const d = draft(fields);
  runInNewContext(`(() => {${receive}})()`, d.scope);
  expect(d.friends()).toEqual([{ id: "selected" }]);
  expect(d.scope.setFriends).not.toHaveBeenCalled();
  expect(d.scope.clearPending).toHaveBeenCalledTimes("pendingUser" in fields ? 0 : 1);
});
it("accepts only the current private picker result and deduplicates repeated selections", () => {
  const d = draft();
  runInNewContext(`(() => {${receive}})()`, d.scope);
  expect(d.friends()).toEqual([{ id: "selected" }, { id: "new" }]);
  runInNewContext(`(() => {${receive}})()`, d.scope);
  expect(d.friends()).toHaveLength(2);
});
it.each([{ type: "PUBLIC" }, { group: {} }, { submitting: true }, { uploading: true }])(
  "does not open the friend picker while unavailable %j",
  (fields) => {
    expect(choose).toBeTruthy();
    const d = draft(fields);
    runInNewContext(`(() => {${choose}})()`, d.scope);
    expect(d.scope.router.push).not.toHaveBeenCalled();
  },
);
it("keeps the existing private friend route and slot-scoped exclusion list", () => {
  const d = draft();
  runInNewContext(`(() => {${choose}})()`, d.scope);
  expect(d.scope.router.push).toHaveBeenCalledWith({
    pathname: "/group/search-user",
    params: { slotId: "current", source: "group", exclude: "selected" },
  });
});
