import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Groups } from "@/components/Groups";
import { renderWithI18n } from "@/test-utils";

const useGroupsMock = vi.fn();
const useContactsMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "admin", getToken: vi.fn().mockResolvedValue("token") }),
}));
vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  useGroups: () => useGroupsMock(),
  useContacts: () => useContactsMock(),
  resolveApiUrl: (value?: string | null) => value ?? "http://localhost:4000",
}));

const group = {
  id: "11111111-1111-4111-8111-111111111111",
  adminUserId: "admin",
  name: "Board Gamers",
  isPublic: false,
  memberCount: 1,
  memberProfiles: [{ id: "admin", name: "Admin", email: null, avatarUrl: null }],
  invitations: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const create = { mutateAsync: vi.fn().mockResolvedValue(group), isPending: false };
const update = { mutateAsync: vi.fn().mockResolvedValue(group), isPending: false };
const archive = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const leave = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const respond = { mutate: vi.fn(), isPending: false };

beforeEach(() => {
  vi.clearAllMocks();
  useGroupsMock.mockReturnValue({
    list: { data: [], isPending: false, isError: false },
    create,
    update,
    archive,
    leave,
    respond,
  });
  useContactsMock.mockReturnValue({
    friends: {
      data: [{ profile: { id: "friend", name: "Friend" } }],
      isPending: false,
      isError: false,
    },
  });
});

describe("Groups", () => {
  it("shows empty state and creates private or public group with selected friend", async () => {
    renderWithI18n(<Groups />);
    expect(screen.getByText("No groups yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Game Friends" } });
    fireEvent.click(screen.getByRole("switch", { name: "Public group" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() =>
      expect(create.mutateAsync).toHaveBeenCalledWith({
        name: "Game Friends",
        isPublic: true,
        invitedUserIds: ["friend"],
      }),
    );
  });

  it("shows role, visibility, accepted count and admin edit/delete confirmation", async () => {
    useGroupsMock.mockReturnValue({
      list: { data: [group], isPending: false, isError: false },
      create,
      update,
      archive,
      leave,
      respond,
    });
    renderWithI18n(<Groups />);
    expect(screen.getByText("Board Gamers")).toBeTruthy();
    expect(screen.getByLabelText("Group admin")).toBeTruthy();
    expect(screen.getByText("Private")).toBeTruthy();
    expect(screen.getByText(/1 member/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit group" }));
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "New Group Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({
        id: group.id,
        input: { name: "New Group Name", isPublic: false, invitedUserIds: [] },
      }),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete group" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
    expect(screen.getByRole("dialog", { name: "Delete group?" })).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete group" }),
    );
    await waitFor(() => expect(archive.mutateAsync).toHaveBeenCalledWith(group.id));
  });

  it("handles invitations, leave confirmation, and network failure without fake empty state", () => {
    const invitation = {
      id: "22222222-2222-4222-8222-222222222222",
      groupId: group.id,
      inviteeUserId: "admin",
      status: "PENDING",
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
    useGroupsMock.mockReturnValue({
      list: {
        data: [{ ...group, adminUserId: "other", invitations: [invitation] }],
        isPending: false,
        isError: false,
      },
      create,
      update,
      archive,
      leave,
      respond,
    });
    const { unmount } = renderWithI18n(<Groups />);
    fireEvent.click(screen.getByRole("button", { name: "Accept group invitation" }));
    expect(respond.mutate).toHaveBeenCalledWith({
      invitationId: invitation.id,
      decision: "accept",
    });
    fireEvent.click(screen.getByRole("button", { name: "Decline group invitation" }));
    expect(respond.mutate).toHaveBeenCalledWith({
      invitationId: invitation.id,
      decision: "decline",
    });
    unmount();
    useGroupsMock.mockReturnValue({
      list: { data: undefined, isPending: false, isError: true },
      create,
      update,
      archive,
      leave,
      respond,
    });
    renderWithI18n(<Groups />);
    expect(screen.getByRole("alert").textContent).toBe("Could not load groups");
    expect(screen.queryByText("No groups yet")).toBeNull();
  });
});
