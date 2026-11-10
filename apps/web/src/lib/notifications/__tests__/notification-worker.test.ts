import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { notificationItemId } from "@board-game-organizer/schemas";
import { expect, it, vi } from "vitest";

const id = "11111111-1111-4111-8111-111111111111";
type ClickEvent = {
  notification: { close: () => void; data: { href: string; attentionItemId?: string } };
  waitUntil: (value: unknown) => void;
};
function worker() {
  const handlers = new Map<string, (event: ClickEvent) => void>(),
    openWindow = vi.fn(),
    close = vi.fn();
  runInNewContext(readFileSync("public/firebase-messaging-sw.js", "utf8"), {
    URL,
    clients: { openWindow },
    self: {
      location: { origin: "https://web.test" },
      addEventListener: (name: string, handler: (event: ClickEvent) => void) =>
        handlers.set(name, handler),
    },
  });
  const click = (href: string, attentionItemId?: string) =>
    handlers.get("notificationclick")?.({
      notification: { close, data: { href, attentionItemId } },
      waitUntil: vi.fn(),
    });
  return { click, openWindow, close };
}
it("shows the mascot icon and monochrome badge while retaining the push destination", () => {
  const showNotification = vi.fn(async () => {}),
    waitUntil = vi.fn();
  type PushEvent = { data: { json: () => unknown }; waitUntil: typeof waitUntil };
  const handlers = new Map<string, (event: PushEvent) => void>();
  runInNewContext(readFileSync("public/firebase-messaging-sw.js", "utf8"), {
    self: {
      registration: { showNotification },
      addEventListener: (name: string, handler: (event: PushEvent) => void) =>
        handlers.set(name, handler),
    },
  });
  const point = notificationItemId(id, "member", "user_member");
  handlers.get("push")?.({
    data: {
      json: () => ({
        data: {
          title: "Game night",
          description: "A seat is available",
          href: `/groups/${id}`,
          attentionItemId: point,
        },
      }),
    },
    waitUntil,
  });
  expect(showNotification).toHaveBeenCalledWith("Game night", {
    body: "A seat is available",
    data: { href: `/groups/${id}`, attentionItemId: point },
    icon: "/branding/notification-icon.png",
    badge: "/branding/notification-badge.png",
  });
  expect(waitUntil).toHaveBeenCalledWith(showNotification.mock.results[0].value);
});

it("routes member hints to Members, preserving the exact point and same-origin guard", () => {
  const { click, openWindow, close } = worker(),
    point = notificationItemId(id, "member", "user_member");
  click(`/groups/${id}`, point);
  const destination = new URL(openWindow.mock.calls[0][0]);
  expect(destination.pathname).toBe(`/groups/${id}`);
  expect(destination.searchParams.get("tab")).toBe("members");
  expect(destination.searchParams.get("attention")).toBe(point);
  expect(close).toHaveBeenCalledOnce();
  click(`https://evil.test/groups/${id}`, point);
  expect(openWindow).toHaveBeenCalledOnce();
});
it("never attaches the Members tab to Event or mismatched Group hints", () => {
  const { click, openWindow } = worker(),
    point = notificationItemId(id, "members");
  click(`/events/${id}`, point);
  expect(new URL(openWindow.mock.calls[0][0]).searchParams.has("tab")).toBe(false);
  click("/groups/22222222-2222-4222-8222-222222222222", point);
  expect(new URL(openWindow.mock.calls[1][0]).searchParams.has("attention")).toBe(false);
});
