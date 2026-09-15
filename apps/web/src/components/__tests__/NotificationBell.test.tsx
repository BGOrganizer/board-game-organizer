import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/NotificationBell";
import { renderWithI18n } from "@/test-utils";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  routerPush: vi.fn(),
  getWebPushToken: vi.fn(async () => "web-token-1234567890" as string | null),
  requestPermission: vi.fn(async () => "granted" as NotificationPermission),
  state: {} as Record<string, unknown>,
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: vi.fn(async () => "token"),
    isLoaded: true,
    isSignedIn: true,
    userId: "user_1",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.routerPush }) }));
vi.mock("@/lib/webPush", () => ({
  isWebPushConfigured: () => true,
  getWebPushToken: mocks.getWebPushToken,
}));
vi.mock("@board-game-organizer/shared", () => ({
  resolveApiUrl: (value?: string) => value || "http://localhost:4000",
  useNotifications: () => mocks.state,
}));

const notification = {
  id: "0123456789abcdef01234567",
  kind: "friend_request",
  title: "New friend request",
  description: "Alex sent you a friend request.",
  href: "/contacts",
  readAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
};

function setState(overrides: Record<string, unknown> = {}) {
  mocks.state = {
    list: { isPending: false, isError: false },
    notifications: [notification],
    unreadCount: 3,
    hasMore: false,
    markRead: { mutate: mocks.markRead },
    markAllRead: { mutate: mocks.markAllRead },
    registerPush: { mutateAsync: mocks.push },
    removePush: { mutateAsync: vi.fn() },
    ...overrides,
  };
}

function setPermission(value: NotificationPermission) {
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: { permission: value, requestPermission: mocks.requestPermission },
  });
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState();
    setPermission("denied");
  });

  it("shows unread badge and notification actions", async () => {
    renderWithI18n(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("New friend request")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    fireEvent.click(screen.getByText("Mark all as read"));
    expect(mocks.markAllRead).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(await screen.findByText("New friend request"));
    expect(mocks.markRead).toHaveBeenCalledWith(notification.id);
    expect(mocks.routerPush).toHaveBeenCalledWith("/contacts");
  });

  it("always links to full notification page", async () => {
    setState({ notifications: [], unreadCount: 0 });
    renderWithI18n(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(await screen.findByText("View all notifications"));
    expect(mocks.routerPush).toHaveBeenCalledWith("/notifications");
  });

  it.each([
    [{ isPending: true, isError: false }, "Loading notifications"],
    [{ isPending: false, isError: true }, "Could not load notifications"],
    [{ isPending: false, isError: false }, "No notifications yet"],
  ])("shows list state", async (list, message) => {
    setState({ list, notifications: [], unreadCount: 0 });
    renderWithI18n(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("surfaces unsupported push registration", async () => {
    setPermission("default");
    mocks.getWebPushToken.mockResolvedValueOnce(null);
    renderWithI18n(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(await screen.findByText("Enable push notifications"));
    expect(await screen.findByText("Could not enable push notifications")).toBeTruthy();
  });

  it("requests push permission only after explicit action", async () => {
    setPermission("default");
    renderWithI18n(<NotificationBell />);
    expect(mocks.requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(await screen.findByText("Enable push notifications"));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.requestPermission).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith({
      token: "web-token-1234567890",
      platform: "web",
      locale: "en",
    });
  });
});
