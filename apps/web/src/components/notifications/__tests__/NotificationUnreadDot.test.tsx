import { readFileSync } from "node:fs";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { NotificationUnreadDot } from "@/components/common/ui/NotificationUnreadDot";
import { GameListRow } from "@/components/games/GameListRow";
import { GroupCard } from "@/components/groups/GroupCard";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";

const state = vi.hoisted(() => ({ count: 2, read: vi.fn() }));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useNotificationAttentionContext: () => ({
    owner: "api:user",
    get: () => ({ count: state.count }),
    read: state.read,
  }),
}));
beforeEach(() => {
  state.count = 2;
  state.read.mockReset();
});

it("renders only a static danger dot; has no animation, observers, store or acknowledgement", () => {
  const q = renderWithI18n(<NotificationUnreadDot active={false} />);
  expect(screen.queryByRole("img")).toBeNull();
  q.rerender(<NotificationUnreadDot active />);
  const dot = screen.getByRole("img", { name: "Unread updates" });
  expect(dot.className).toContain("badge--danger");
  expect(dot.style.width).toBe("8px");
  expect(dot.style.position).toBe("relative");
  expect(dot.style.transform).toBe("none");
  expect(state.read).not.toHaveBeenCalled();
  const css = readFileSync("src/app/globals.css", "utf8");
  expect(css).not.toMatch(/notification-attention-(border|pulse)/);
});

it("puts the marker after a shrinkable title, before other card metadata, without acknowledging on navigation", () => {
  renderWithI18n(
    <LinkedListCard
      href="/groups/id"
      label="Open group"
      notificationCount={2}
      artwork={<span aria-hidden>Artwork</span>}
    >
      <ListCardBody
        title="An unusually long group title"
        unread
        titleAccessory={<span>Private</span>}
      >
        <span>Metadata</span>
      </ListCardBody>
    </LinkedListCard>,
  );
  const link = screen.getByRole("link", { name: "Open group" });
  const dot = screen.getByRole("img", { name: "Unread updates" });
  expect(dot.previousElementSibling?.textContent).toBe("An unusually long group title");
  expect(dot.previousElementSibling?.className).toContain("break-words");
  expect(link.closest(".card")?.contains(dot)).toBe(true);
  expect(link.getAttribute("aria-description")).toBe("Unread updates");
  expect(state.read).not.toHaveBeenCalled();
});

it.each(["game", "location"])(
  "keeps a passive %s marker in the name slot with no read action in vote controls",
  (kind) => {
    const marker = <NotificationItem itemId="source-item" />;
    renderWithI18n(
      kind === "game" ? (
        <GameListRow name="A long board game name" titleAccessory={marker} />
      ) : (
        <LocationListRow
          name="A long verified venue name"
          address="Via Roma 1"
          titleAccessory={marker}
        />
      ),
    );
    const dot = screen.getByRole("img", { name: "Unread updates" });
    expect(dot.parentElement?.previousElementSibling?.getAttribute("title")).toContain("long");
    expect(state.read).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
    fireEvent.click(dot);
    expect(state.read).not.toHaveBeenCalled();
  },
);

it("retains an actionable admin request after unread state is cleared, and opening help never reads or decides", async () => {
  const group = { ...groupRecord, role: "admin" as const, pendingRequestCount: 2 };
  const view = renderWithI18n(<GroupCard group={group} />);
  expect(screen.getByRole("img", { name: "Unread updates" })).not.toBeNull();
  const name = "Admin · Requests to review";
  fireEvent.click(screen.getByRole("button", { name }));
  expect(
    await screen.findByText("Open Members to approve or reject membership requests."),
  ).not.toBeNull();
  expect(state.read).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  state.count = 0;
  view.rerender(<GroupCard group={group} />);
  expect(screen.queryByRole("img", { name: "Unread updates" })).toBeNull();
  expect(screen.getByRole("button", { name })).not.toBeNull();
  view.rerender(<GroupCard group={{ ...group, pendingRequestCount: 0 }} />);
  expect(screen.queryByRole("button", { name })).toBeNull();
});
