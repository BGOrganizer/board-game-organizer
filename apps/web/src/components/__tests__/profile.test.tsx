import type { BggAccountResponse } from "@board-game-organizer/schemas";
import type { UserProfile } from "@board-game-organizer/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Profile } from "@/components/Profile";
import { renderWithI18n } from "@/test-utils";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: vi.fn().mockResolvedValue("test-token"),
  }),
  useClerk: () => ({ signOut: vi.fn().mockResolvedValue(undefined) }),
}));

const profile: UserProfile = {
  id: "user_1",
  name: "Alessandro",
  email: "a@b.it",
  avatarUrl: "https://example.com/a.png",
  preferredLanguage: "it",
  plan: "free",
  stats: {
    friends: 4,
    followers: 6,
    following: 2,
    playedMatches: 12,
    adminGroups: 3,
    joinedGroups: 7,
  },
};

const { useProfileQueryMock, useBggAccountMock } = vi.hoisted(() => ({
  useProfileQueryMock: vi.fn(),
  useBggAccountMock: vi.fn(() => ({
    account: {
      data: { active: null as BggAccountResponse["active"], pending: null },
      isError: false,
      refetch: vi.fn(),
    },
    link: { mutateAsync: vi.fn(), isPending: false },
    sync: { mutate: vi.fn(), isPending: false },
    unlink: { mutate: vi.fn(), isPending: false },
  })),
}));

vi.mock("@board-game-organizer/shared", () => ({
  resolveApiUrl: (url?: string | null) => url || "http://localhost:4000",
  useProfileQuery: () => useProfileQueryMock(),
  useBggAccount: () => useBggAccountMock(),
}));

describe("Profile", () => {
  it("shows a loading state while the query is pending", () => {
    useProfileQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderWithI18n(<Profile />);
    // Loading state renders a skeleton profile card (no text).
    expect(document.querySelector('[class*="skeleton"]')).toBeTruthy();
  });

  it("shows an error state with retry when the query fails", () => {
    useProfileQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("HTTP 500"),
      refetch: vi.fn(),
    });
    renderWithI18n(<Profile />);
    expect(screen.getByText(/Error while loading the profile:/)).toBeTruthy();
    expect(screen.getByText(/HTTP 500/)).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Logout" }).className).toContain("button--danger");
  });

  it("keeps BGG dialog open on unknown user and confirms disconnect", async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
    useProfileQueryMock.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const link = vi.fn().mockRejectedValue(new Error("BGG user not found"));
    const unlink = vi.fn();
    useBggAccountMock.mockReturnValue({
      account: {
        data: {
          active: {
            id: 41,
            username: "alice",
            avatarUrl: null,
            snapshot: "snap",
            syncedAt: "2026-09-01",
          },
          pending: null,
        },
        isError: false,
        refetch: vi.fn(),
      },
      link: { mutateAsync: link, isPending: false },
      sync: { mutate: vi.fn(), isPending: false },
      unlink: { mutate: unlink, isPending: false },
    });
    renderWithI18n(<Profile />);
    expect(screen.getByText("alice")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sync with BoardGameGeek" }));
    fireEvent.change(screen.getByRole("textbox", { name: "BGG username" }), {
      target: { value: "unknown" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync", hidden: true }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("BGG user not found"),
    );
    expect(screen.getByRole("dialog", { name: "Sync with BoardGameGeek" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect BoardGameGeek" }));
    expect(screen.getByRole("dialog", { name: "Disconnect BoardGameGeek?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect", hidden: true }));
    expect(unlink).toHaveBeenCalledOnce();
    expect(link).toHaveBeenCalledWith("unknown");
  });

  it("renders the profile data when loaded", () => {
    useProfileQueryMock.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderWithI18n(<Profile />);
    expect(screen.getByText("Alessandro")).toBeTruthy();
    expect(screen.getByText("a@b.it")).toBeTruthy();
    for (const label of [
      "Friends: 4",
      "Followers: 6",
      "Following: 2",
      "Matches played: 12",
      "Admin groups: 3",
      "Joined groups: 7",
    ])
      expect(screen.getByRole("group", { name: label })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync with BoardGameGeek" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Logout" }).className).toContain("button--danger");
  });
});
