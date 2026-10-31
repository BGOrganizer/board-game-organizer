import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as itMessages } from "../../../../../../messages/it.js";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  syncLanguage: vi.fn(),
  userId: "user_1",
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  limit: vi.fn(),
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
    userId: mocks.userId,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.routerPush }) }));
vi.mock("@/lib/notifications/webPush", () => ({
  isWebPushConfigured: () => true,
  getWebPushToken: mocks.getWebPushToken,
}));
vi.mock("@board-game-organizer/shared", () => ({
  resolveApiUrl: (value?: string) => value || "http://localhost:4000",
  usePreferredLanguageSync: mocks.syncLanguage,
  useNotifications: (...args: unknown[]) => {
    mocks.limit(...args);
    return mocks.state;
  },
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
    mocks.userId = "user_1";
    setPermission("denied");
  });

  it("shows unread badge and notification actions", async () => {
    renderWithI18n(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("New friend request")).toBeTruthy();
    expect(mocks.limit).toHaveBeenCalledWith(expect.any(Object), 3);
    expect(document.querySelector(".lucide-user-round-plus")).toBeTruthy();
    expect(document.querySelector('[data-slot="dropdown-popover"]')?.className).toContain(
      "bg-surface",
    );
    expect(screen.getByText("3")).toBeTruthy();
    fireEvent.click(screen.getByText("Mark all as read"));
    expect(mocks.markAllRead).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    fireEvent.click(await screen.findByText("New friend request"));
    expect(mocks.markRead).toHaveBeenCalledWith(notification.id);
    expect(mocks.routerPush).toHaveBeenCalledWith("/contacts");
  });

  it("shows at most three notifications even with extra cached rows", async () => {
    setState({
      notifications: [0, 1, 2, 3].map((index) => ({
        ...notification,
        id: String(index),
        title: `Notification ${index}`,
      })),
    });
    renderWithI18n(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("Notification 2")).toBeTruthy();
    expect(screen.queryByText("Notification 3")).toBeNull();
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

  it("refreshes registered device locale/identity without another permission prompt", async () => {
    setPermission("granted");
    const i18n = setupI18n({ locale: "en", messages: { en, it: itMessages } });
    const view = render(
      <I18nProvider i18n={i18n}>
        <NotificationBell />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" })),
    );
    act(() => i18n.activate("it"));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "it" })),
    );
    expect(mocks.syncLanguage).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: "user_1", enabled: true }),
      "it",
    );
    mocks.userId = "user_2";
    view.rerender(
      <I18nProvider i18n={i18n}>
        <NotificationBell />
      </I18nProvider>,
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(3));
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });

  it("never posts an old device locale when language changes while token registration is pending", async () => {
    setPermission("granted");
    let release!: (token: string) => void;
    mocks.getWebPushToken.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    const i18n = setupI18n({ locale: "en", messages: { en, it: itMessages } });
    render(
      <I18nProvider i18n={i18n}>
        <NotificationBell />
      </I18nProvider>,
    );
    await waitFor(() => expect(mocks.getWebPushToken).toHaveBeenCalledOnce());
    act(() => i18n.activate("it"));
    await act(async () => release("old-token"));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledOnce());
    expect(mocks.push).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "it" }));
  });

  it("requests push permission only after explicit action", async () => {
    setPermission("default");
    renderWithI18n(<NotificationBell />);
    expect(mocks.requestPermission).not.toHaveBeenCalled();
    expect(mocks.syncLanguage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", enabled: true }),
      "en",
    );
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
