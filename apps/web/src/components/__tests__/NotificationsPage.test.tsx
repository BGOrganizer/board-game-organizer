import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPage } from "@/components/NotificationsPage";
import { renderWithI18n } from "@/test-utils";

const mocks = vi.hoisted(() => ({
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
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
vi.mock("@board-game-organizer/shared", () => ({
  resolveApiUrl: (value?: string) => value || "http://localhost:4000",
  useNotifications: () => mocks.state,
}));

const item = {
  id: "0123456789abcdef01234567",
  kind: "match_invitation",
  title: "New match invitation",
  description: "Alex invited you to Catan.",
  href: "/matches",
  readAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
};

function setState(overrides: Record<string, unknown> = {}) {
  mocks.state = {
    list: {
      isPending: false,
      isError: false,
      isFetchingNextPage: false,
      refetch: mocks.refetch,
      fetchNextPage: mocks.fetchNextPage,
    },
    notifications: [item],
    unreadCount: 1,
    hasMore: false,
    markRead: { mutate: mocks.markRead },
    markAllRead: { mutate: mocks.markAllRead },
    ...overrides,
  };
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState();
  });

  it("renders inbox and marks notifications read", () => {
    renderWithI18n(<NotificationsPage />);
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeTruthy();
    fireEvent.click(screen.getByText("Mark all as read"));
    expect(mocks.markAllRead).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("New match invitation"));
    expect(mocks.markRead).toHaveBeenCalledWith(item.id);
  });

  it("renders loading, error retry, and empty states", () => {
    setState({ list: { isPending: true, isError: false }, notifications: [], unreadCount: 0 });
    const loading = renderWithI18n(<NotificationsPage />);
    expect(screen.getByRole("status", { name: "Loading notifications" })).toBeTruthy();
    loading.unmount();

    setState({
      list: { isPending: false, isError: true, refetch: mocks.refetch },
      notifications: [],
      unreadCount: 0,
    });
    const failed = renderWithI18n(<NotificationsPage />);
    fireEvent.click(screen.getByText("Try again"));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    failed.unmount();

    setState({ list: { isPending: false, isError: false }, notifications: [], unreadCount: 0 });
    renderWithI18n(<NotificationsPage />);
    expect(screen.getByText("No notifications yet")).toBeTruthy();
  });

  it("loads another page without a spinner", () => {
    setState({
      list: {
        isPending: false,
        isError: false,
        isFetchingNextPage: false,
        fetchNextPage: mocks.fetchNextPage,
      },
      hasMore: true,
    });
    renderWithI18n(<NotificationsPage />);
    fireEvent.click(screen.getByText("Load more"));
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });
});
