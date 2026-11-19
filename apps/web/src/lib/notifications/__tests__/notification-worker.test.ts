import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { runInNewContext } from "node:vm";
import { notificationItemId } from "@board-game-organizer/schemas";
import { expect, it, vi } from "vitest";

const id = "11111111-1111-4111-8111-111111111111";
// Node filesystem input must not pass through Vite/Vitest's browser asset-URL rewriting.
const filename = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../public/firebase-messaging-sw.js",
);
const source = readFileSync(filename, "utf8");

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const openWindow = vi.fn(async (_url: string) => ({ id: "opened-window" }));
  const showNotification = vi.fn(async (_title: string, _options: unknown) => {});
  const close = vi.fn();
  const waitUntil = vi.fn((_value: Promise<unknown>) => {});
  // The unmodified deployed worker is the SUT; only browser-owned globals are controlled.
  runInNewContext(
    source,
    {
      URL,
      clients: { openWindow },
      self: {
        location: { origin: "https://web.test" },
        registration: { showNotification },
        addEventListener: (name: string, handler: (event: unknown) => void) =>
          handlers.set(name, handler),
      },
    },
    { filename },
  );
  const click = (href?: string, attentionItemId?: unknown) =>
    handlers.get("notificationclick")?.({
      notification: { close, data: { href, attentionItemId } },
      waitUntil,
    });
  const push = (payload?: unknown) =>
    handlers.get("push")?.({
      ...(payload === undefined ? {} : { data: { json: () => payload } }),
      waitUntil,
    });
  return { click, push, handlers, openWindow, showNotification, close, waitUntil };
}

it("shows the mascot icon and monochrome badge while retaining the push destination", () => {
  const { push, showNotification, waitUntil } = worker();
  const point = notificationItemId(id, "member", "user_member");
  push({
    data: {
      title: "Game night",
      description: "A seat is available",
      href: `/groups/${id}`,
      attentionItemId: point,
    },
  });
  expect(showNotification).toHaveBeenCalledExactlyOnceWith("Game night", {
    body: "A seat is available",
    data: { href: `/groups/${id}`, attentionItemId: point },
    icon: "/branding/notification-icon.png",
    badge: "/branding/notification-badge.png",
  });
  expect(waitUntil).toHaveBeenCalledExactlyOnceWith(showNotification.mock.results[0].value);
});

it("ignores an empty browser push or a payload without a title", () => {
  const { push, showNotification, waitUntil } = worker();
  push();
  push({ data: { description: "No title" } });
  expect(showNotification).not.toHaveBeenCalled();
  expect(waitUntil).not.toHaveBeenCalled();
});

it("accepts a direct provider payload and supplies the inbox destination when omitted", () => {
  const { push, showNotification } = worker();
  push({ title: "Direct title", description: "Direct body" });
  expect(showNotification).toHaveBeenCalledExactlyOnceWith("Direct title", {
    body: "Direct body",
    data: { href: "/notifications", attentionItemId: undefined },
    icon: "/branding/notification-icon.png",
    badge: "/branding/notification-badge.png",
  });
});

it("routes member hints to Members, preserving the exact point and same-origin guard", () => {
  const { click, openWindow, close, waitUntil } = worker();
  const point = notificationItemId(id, "member", "user_member");
  click(`/groups/${id}`, point);
  const destination = new URL(openWindow.mock.calls[0][0]);
  expect(destination.pathname).toBe(`/groups/${id}`);
  expect(destination.searchParams.get("tab")).toBe("members");
  expect(destination.searchParams.get("attention")).toBe(point);
  expect(destination.hash).toBe(`#attention-${encodeURIComponent(point)}`);
  expect(close).toHaveBeenCalledOnce();
  expect(waitUntil).toHaveBeenCalledExactlyOnceWith(openWindow.mock.results[0].value);
  click(`https://evil.test/groups/${id}`, point);
  expect(openWindow).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledTimes(2);
});

it("never attaches the Members tab to Event or mismatched Group hints", () => {
  const { click, openWindow } = worker();
  const point = notificationItemId(id, "members");
  click(`/events/${id}`, point);
  expect(new URL(openWindow.mock.calls[0][0]).searchParams.has("tab")).toBe(false);
  click("/groups/22222222-2222-4222-8222-222222222222", point);
  expect(new URL(openWindow.mock.calls[1][0]).searchParams.has("attention")).toBe(false);
});

it("retains the Members section and existing query parameters for a whole-members hint", () => {
  const { click, openWindow } = worker();
  const point = notificationItemId(id, "members");
  click(`/groups/${id}?filter=accepted`, point);
  const destination = new URL(openWindow.mock.calls[0][0]);
  expect(destination.searchParams.get("filter")).toBe("accepted");
  expect(destination.searchParams.get("tab")).toBe("members");
  expect(destination.searchParams.get("attention")).toBe(point);
});

it("attaches an Event point without incorrectly selecting a Group members tab", () => {
  const { click, openWindow } = worker();
  const point = notificationItemId(id, "dates");
  click(`/events/${id}`, point);
  const destination = new URL(openWindow.mock.calls[0][0]);
  expect(destination.searchParams.has("tab")).toBe(false);
  expect(destination.searchParams.get("attention")).toBe(point);
});

it.each([
  { hint: undefined },
  { hint: 42 },
  { hint: "x".repeat(1001) },
  { hint: "not-json" },
  { hint: JSON.stringify({ event: id }) },
  { hint: JSON.stringify(["event", id, "dates"]) },
  { hint: JSON.stringify(["event", 42, "dates", null]) },
])("opens the legitimate destination without an invalid optional hint ($hint)", ({ hint }) => {
  const { click, openWindow } = worker();
  click(`/events/${id}`, hint);
  expect(openWindow).toHaveBeenCalledExactlyOnceWith(`https://web.test/events/${id}`);
});

it("opens inbox for historical notifications that have no destination or data", () => {
  const { click, handlers, openWindow, close, waitUntil } = worker();
  click();
  handlers.get("notificationclick")?.({ notification: { close }, waitUntil });
  expect(openWindow.mock.calls).toEqual([
    ["https://web.test/notifications"],
    ["https://web.test/notifications"],
  ]);
});
