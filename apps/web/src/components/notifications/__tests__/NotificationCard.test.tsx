import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { NotificationCard } from "../NotificationCard";

const unread = {
  kind: "event_confirmed",
  title: "Game night confirmed",
  description: "The table begins at 8 PM.",
  createdAt: "2030-06-01T10:00:00.000Z",
  readAt: null,
} as const;

it("keeps a read-only notification fully navigable without rendering unavailable management actions", () => {
  renderWithI18n(
    <NotificationCard
      notification={unread}
      renderDestination={(content, className) => (
        <a href="/events/friday" className={className}>
          {content}
        </a>
      )}
    />,
  );
  const card = within(screen.getByRole("article"));
  const destination = card.getByRole("link", { name: /Game night confirmed/ });
  expect(destination).toHaveAttribute("href", "/events/friday");
  expect(destination).not.toHaveClass("pe-12");
  expect(card.getByText(unread.description)).toBeVisible();
  expect(card.queryByRole("button")).toBeNull();
});

it("keeps only the action authorized by the host and removes it after the read receipt", () => {
  const markRead = vi.fn();
  const page = (readAt: string | null) => (
    <NotificationCard
      notification={{ ...unread, readAt }}
      onRead={markRead}
      renderDestination={(content, className) => (
        <a href="/events/friday" className={className}>
          {content}
        </a>
      )}
    />
  );
  const view = renderWithI18n(page(null));
  const card = within(screen.getByRole("article"));
  expect(card.getByRole("link")).toHaveClass("pe-12");
  expect(card.queryByRole("button", { name: "Delete notification" })).toBeNull();
  fireEvent.click(card.getByRole("button", { name: "Mark as read" }));
  expect(markRead).toHaveBeenCalledOnce();
  view.rerender(page("2030-06-01T11:30:00.000Z"));
  expect(card.queryByRole("button", { name: "Mark as read" })).toBeNull();
  expect(card.getByRole("link")).toBeVisible();
});
