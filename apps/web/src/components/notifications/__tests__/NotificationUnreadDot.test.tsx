import { readFileSync } from "node:fs";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { NotificationUnreadDot } from "@/components/common/ui/NotificationUnreadDot";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { renderWithI18n } from "@/test-utils";

const read = vi.hoisted(() => vi.fn());
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useNotificationAttentionContext: () => ({
    owner: "api:user",
    get: () => ({ count: 2 }),
    read,
  }),
}));
beforeEach(() => read.mockReset());

it("renders only a static danger dot; has no animation, observers, store or acknowledgement", () => {
  const q = renderWithI18n(<NotificationUnreadDot active={false} />);
  expect(screen.queryByRole("img")).toBeNull();
  q.rerender(<NotificationUnreadDot active />);
  const dot = screen.getByRole("img", { name: "Unread updates" });
  expect(dot.className).toContain("badge--danger");
  expect(dot.style.width).toBe("8px");
  expect(dot.style.position).toBe("relative");
  expect(dot.style.transform).toBe("none");
  expect(read).not.toHaveBeenCalled();
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
  expect(read).not.toHaveBeenCalled();
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
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull();
    fireEvent.click(dot);
    expect(read).not.toHaveBeenCalled();
  },
);

it("can open a place vote breakdown using its label when there is no address", () => {
  renderWithI18n(
    <LocationListRow
      name="Game café"
      titleAccessory={<NotificationItem itemId="source-item" />}
      disclosure={{
        label: "Votes for Game café",
        triggerText: "Votes",
        content: "Avery voted yes",
      }}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Votes for Game café" });
  expect(screen.queryByText("Avery voted yes")).toBeNull();
  fireEvent.click(trigger);
  expect(screen.getByText("Avery voted yes")).toBeTruthy();
  expect(read).not.toHaveBeenCalled();
});
