import {
  type NotificationAttentionCount,
  type NotificationAttentionSnapshot,
  notificationItemId,
} from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupMemberAttention } from "@/components/groups/GroupMemberAttention";
import { renderWithI18n } from "@/test-utils";

const state = vi.hoisted(() => ({
  row: undefined as NotificationAttentionCount | undefined,
  read: vi.fn(),
  owner: JSON.stringify(["https://api.test", "owner"]),
}));
const options = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock(
  "../../../../../../packages/shared/src/notifications/NotificationAttentionProvider",
  async (original) => ({
    ...(await original<
      typeof import("../../../../../../packages/shared/src/notifications/NotificationAttentionProvider")
    >()),
    useNotificationAttentionContext: () => ({
      owner: state.owner,
      get: () => state.row,
      read: state.read,
    }),
  }),
);
const groupId = "11111111-1111-4111-8111-111111111111",
  userId = "user_member";
const target = { kind: "item", id: notificationItemId(groupId, "member", userId) } as const;
const key = ["notification-attention", options.apiUrl, options.userId, "member"];
let client: QueryClient,
  intersects: IntersectionObserverCallback[],
  focused: boolean,
  visibility: DocumentVisibilityState;
function source(at = "2027-01-01T00:00:00.000Z", count = 1): NotificationAttentionSnapshot {
  state.row = {
    target,
    count,
    direct: count,
    events: 0,
    sections: { connections: 0, requests: 0, search: 0 },
    signal: `${at}|source`,
  };
  const snapshot = {
    asOf: at,
    unreadCount: count,
    summary: { tables: 0, events: 0, groups: count, contacts: 0, sections: state.row.sections },
    targets: [state.row],
  };
  client.setQueryData(key, snapshot);
  return snapshot;
}
function enter(visible = true) {
  act(() => {
    for (const cb of intersects)
      cb(
        [
          {
            isIntersecting: visible,
            intersectionRatio: visible ? 1 : 0,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
  });
}
function render() {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <GroupMemberAttention groupId={groupId} userId={userId} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));
  state.read.mockReset();
  state.owner = JSON.stringify([options.apiUrl, options.userId]);
  state.row = undefined;
  client = new QueryClient();
  intersects = [];
  focused = true;
  visibility = "visible";
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersects.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("acknowledges a real member only after five continuous seconds of actual visibility, with the original cutoff", () => {
  const captured = source();
  render();
  expect(screen.getByRole("img", { name: "Unread updates" }).className).toContain("badge--danger");
  act(() => vi.advanceTimersByTime(10_000));
  expect(state.read).not.toHaveBeenCalled();
  enter();
  act(() => vi.advanceTimersByTime(4_999));
  expect(state.read).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(state.read).toHaveBeenCalledExactlyOnceWith(target, captured);
});
it.each(["offscreen", "blur", "hidden"])(
  "restarts the dwell after %s rather than counting hidden time",
  (cause) => {
    source();
    render();
    enter();
    act(() => vi.advanceTimersByTime(4_000));
    if (cause === "offscreen") enter(false);
    else if (cause === "blur") {
      focused = false;
      fireEvent(window, new Event("blur"));
    } else {
      visibility = "hidden";
      fireEvent(document, new Event("visibilitychange"));
    }
    act(() => vi.advanceTimersByTime(10_000));
    expect(state.read).not.toHaveBeenCalled();
    if (cause === "offscreen") enter();
    else if (cause === "blur") {
      focused = true;
      fireEvent(window, new Event("focus"));
    } else {
      visibility = "visible";
      fireEvent(document, new Event("visibilitychange"));
    }
    act(() => vi.advanceTimersByTime(4_999));
    expect(state.read).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(state.read).toHaveBeenCalledTimes(1);
  },
);
it("pauses when a modal hides the row's ancestor from interaction", async () => {
  source();
  const view = render();
  enter();
  act(() => vi.advanceTimersByTime(4_000));
  await act(async () => view.container.setAttribute("aria-hidden", "true"));
  act(() => vi.advanceTimersByTime(10_000));
  expect(state.read).not.toHaveBeenCalled();
  await act(async () => view.container.removeAttribute("aria-hidden"));
  act(() => vi.advanceTimersByTime(5_000));
  expect(state.read).toHaveBeenCalledTimes(1);
});
it("restarts on a new revision and never consumes it using the earlier visibility window", () => {
  source();
  const view = render();
  enter();
  act(() => vi.advanceTimersByTime(4_000));
  const newer = source("2027-01-01T00:00:04.000Z", 2);
  view.rerender(
    <QueryClientProvider client={client}>
      <GroupMemberAttention groupId={groupId} userId={userId} />
    </QueryClientProvider>,
  );
  act(() => vi.advanceTimersByTime(4_999));
  expect(state.read).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(state.read).toHaveBeenCalledExactlyOnceWith(target, newer);
});
it("cancels on unmount or owner replacement and does not invent a missing source snapshot", () => {
  source();
  let view = render();
  enter();
  view.unmount();
  act(() => vi.advanceTimersByTime(5_000));
  expect(state.read).not.toHaveBeenCalled();
  view = render();
  enter();
  state.owner = "another-owner";
  view.rerender(
    <QueryClientProvider client={client}>
      <GroupMemberAttention groupId={groupId} userId={userId} />
    </QueryClientProvider>,
  );
  act(() => vi.advanceTimersByTime(5_000));
  expect(state.read).not.toHaveBeenCalled();
  view.unmount();
  state.owner = JSON.stringify([options.apiUrl, options.userId]);
  client.clear();
  render();
  enter();
  act(() => vi.advanceTimersByTime(5_000));
  expect(state.read).not.toHaveBeenCalled();
});
it("creates no visibility observers or timer for a member without unread source attention", () => {
  source("2027-01-01T00:00:00.000Z", 0);
  render();
  expect(intersects).toHaveLength(0);
  act(() => vi.advanceTimersByTime(10_000));
  expect(state.read).not.toHaveBeenCalled();
});
it("retains a static dot when visibility cannot be observed", () => {
  source();
  vi.stubGlobal("IntersectionObserver", undefined);
  render();
  act(() => vi.advanceTimersByTime(10_000));
  expect(state.read).not.toHaveBeenCalled();
  expect(screen.getByRole("img", { name: "Unread updates" })).toBeTruthy();
});
