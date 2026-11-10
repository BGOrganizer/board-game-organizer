import { notificationItemId } from "@board-game-organizer/schemas";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { renderWithI18n } from "@/test-utils";

const state = vi.hoisted(() => ({ count: 1, read: vi.fn() }));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useNotificationAttentionContext: () => ({
    get: () => ({ count: state.count }),
    read: state.read,
  }),
}));
const id = notificationItemId("11111111-1111-4111-8111-111111111111", "member", "user_member");
beforeEach(() => {
  vi.useFakeTimers();
  state.count = 1;
  state.read.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});
it.each([5_000, 60_000])(
  "keeps a member unread after %sms of visibility/focus instead of timed acknowledgement",
  (elapsed) => {
    renderWithI18n(<NotificationItem itemId={id} />);
    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(elapsed));
    expect(screen.getByRole("img", { name: "Unread updates" }).className).toContain(
      "badge--danger",
    );
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
    expect(state.read).not.toHaveBeenCalled();
  },
);
it("keeps the passive marker through interaction and removes it only when source attention changes", () => {
  const view = renderWithI18n(<NotificationItem itemId={id} />);
  fireEvent.click(screen.getByRole("img", { name: "Unread updates" }));
  fireEvent.blur(window);
  fireEvent.focus(window);
  act(() => vi.advanceTimersByTime(60_000));
  expect(state.read).not.toHaveBeenCalled();
  expect(screen.getByRole("img", { name: "Unread updates" })).toBeTruthy();
  state.count = 0;
  view.rerender(<NotificationItem itemId={id} />);
  expect(screen.queryByRole("img", { name: "Unread updates" })).toBeNull();
});
it("retains precise deep-link positioning without acknowledging it", () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  window.history.replaceState({}, "", `/?attention=${encodeURIComponent(id)}`);
  renderWithI18n(
    <NotificationItem itemId={id}>
      <span>Member</span>
    </NotificationItem>,
  );
  expect(scroll).toHaveBeenCalledWith({ block: "center" });
  expect(state.read).not.toHaveBeenCalled();
});
