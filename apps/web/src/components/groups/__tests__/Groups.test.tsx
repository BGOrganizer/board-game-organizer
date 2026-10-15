import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Groups } from "@/components/groups/Groups";
import { renderWithI18n } from "@/test-utils";
import { messages } from "../../../../../../messages/en.js";

const router = { push: vi.fn(), replace: vi.fn() };
const useGroupsMock = vi.fn();
const useContactsMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "admin", getToken: vi.fn().mockResolvedValue("token") }),
}));
vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  useGroups: (options: unknown) => useGroupsMock(options),
  useContacts: () => useContactsMock(),
  resolveApiUrl: (value?: string | null) => value ?? "http://localhost:4000",
}));
vi.mock("@/components/contacts/SearchUserPage", () => ({
  SearchUserPage: ({
    onSelect,
    onClose,
  }: {
    onSelect: (user: unknown) => void;
    onClose: () => void;
  }) => (
    <div>
      <h2>Invite friends</h2>
      <button
        type="button"
        onClick={() => onSelect({ id: "friend", name: "Friend", email: null, avatarUrl: null })}
      >
        Add: Friend
      </button>
      <button type="button" onClick={onClose}>
        Back from search
      </button>
    </div>
  ),
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
const removeInvitation = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const respond = { mutate: vi.fn(), isPending: false };
const groups = (data: unknown = []) => ({
  list: { data, isPending: false, isError: false },
  create,
  update,
  archive,
  leave,
  removeInvitation,
  respond,
});

beforeEach(() => {
  vi.clearAllMocks();
  useGroupsMock.mockReturnValue(groups());
  const query = { data: [], isPending: false, isError: false, isSuccess: true };
  const mutation = { mutate: vi.fn(), isPending: false };
  useContactsMock.mockReturnValue({
    friends: { ...query, data: [{ profile: { id: "friend", name: "Friend" } }] },
    following: query,
    followers: query,
    pending: query,
    sent: query,
    blocked: query,
    follow: mutation,
    unfollow: mutation,
    unfriend: mutation,
    friendRequest: mutation,
    cancelFriendRequest: mutation,
    acceptFriendRequest: mutation,
    rejectFriendRequest: mutation,
    block: mutation,
    unblock: mutation,
  });
});

describe("Groups screens", () => {
  it("starts with all roles and sends searched group name with active roles", async () => {
    renderWithI18n(<Groups />);
    for (const role of ["Admin", "Invited", "Accepted"])
      expect(screen.getByRole("button", { name: role }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Invited" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search groups" }), {
      target: { value: "Chess" },
    });
    await waitFor(() =>
      expect(useGroupsMock.mock.lastCall?.[0].listFilters).toMatchObject({
        query: "Chess",
        roles: ["admin", "accepted"],
        limit: 20,
      }),
    );
  });

  it("navigates from empty list to dedicated create screen", () => {
    renderWithI18n(<Groups />);
    expect(screen.getByText("No groups yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(router.push).toHaveBeenCalledWith("/groups/new");
    expect(screen.queryByLabelText("Group name")).toBeNull();
  });

  it("creates from empty friend slot via search screen, supports header back and HeroUI switch", async () => {
    renderWithI18n(<Groups mode="new" />);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.replace).toHaveBeenCalledWith("/groups");
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Game Friends" } });
    fireEvent.click(screen.getByRole("switch", { name: "Public group" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove invite" }));
    expect(screen.getAllByRole("button", { name: "Select a friend" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove invite" })[0]);
    expect(screen.getAllByRole("button", { name: "Select a friend" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Select a friend" }));
    expect(screen.getByRole("heading", { name: "Invite friends" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add: Friend" }));
    expect(screen.getByText("Friend")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove invite" }));
    expect(screen.getAllByRole("button", { name: "Select a friend" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Select a friend" }));
    fireEvent.click(screen.getByRole("button", { name: "Add: Friend" }));
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() =>
      expect(create.mutateAsync).toHaveBeenCalledWith({
        name: "Game Friends",
        isPublic: true,
        invitedUserIds: ["friend"],
      }),
    );
    expect(router.replace).toHaveBeenCalledWith("/groups");
  });

  it("opens detail from card, edits in dedicated screen and archives with confirmation", async () => {
    useGroupsMock.mockReturnValue(groups([group]));
    const { unmount } = renderWithI18n(<Groups />);
    const groupLink = screen.getByRole("link", { name: "Open group: Board Gamers" });
    expect(groupLink.getAttribute("href")).toBe(`/groups/${group.id}`);
    expect(groupLink.className).toContain("p-3");
    expect(screen.getByLabelText("Group admin")).toBeTruthy();
    expect(document.querySelector('img[src^="data:image/svg+xml,"]')).toBeTruthy();
    expect(screen.getByText("Private")).toBeTruthy();
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe(group.createdAt);
    unmount();
    const detail = renderWithI18n(<Groups mode="detail" groupId={group.id} />);
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Invitations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit group" }));
    expect(router.push).toHaveBeenCalledWith(`/groups/${group.id}/edit`);
    fireEvent.click(screen.getByRole("button", { name: "More group actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
    expect(screen.getByRole("dialog", { name: "Delete group?" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "More group actions" })).toBeNull(),
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Delete group?" })).getByRole("button", {
        name: "Delete group",
      }),
    );
    await waitFor(() => expect(archive.mutateAsync).toHaveBeenCalledWith(group.id));
    detail.unmount();
    renderWithI18n(<Groups mode="edit" groupId={group.id} />);
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "New Group Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({
        id: group.id,
        input: { name: "New Group Name", isPublic: false, invitedUserIds: [] },
      }),
    );
  });

  it("hides the missing-group error while archiving and navigating away", async () => {
    useGroupsMock.mockReturnValue(groups([group]));
    let finishArchive!: () => void;
    archive.mutateAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishArchive = resolve;
        }),
    );
    const { rerender } = renderWithI18n(<Groups mode="detail" groupId={group.id} />);
    fireEvent.click(screen.getByRole("button", { name: "More group actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Delete group?" })).getByRole("button", {
        name: "Delete group",
      }),
    );
    await waitFor(() => expect(archive.mutateAsync).toHaveBeenCalledWith(group.id));
    useGroupsMock.mockReturnValue(groups([]));
    rerender(
      <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: messages } })}>
        <Groups mode="detail" groupId={group.id} />
      </I18nProvider>,
    );
    expect(screen.queryByText("Could not load group details")).toBeNull();
    await act(async () => finishArchive());
    expect(router.push).toHaveBeenCalledWith("/groups");
  });

  it("confirms removal of pending invitees and accepted members without leaving group", async () => {
    const invited = ["PENDING", "ACCEPTED"].map((status, index) => ({
      id: `invite-${index}`,
      groupId: group.id,
      inviteeUserId: `user-${index}`,
      status,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }));
    useGroupsMock.mockReturnValue(
      groups([
        {
          ...group,
          memberCount: 2,
          invitations: invited,
          memberProfiles: [
            ...group.memberProfiles,
            { id: "user-1", name: "Member", email: null, avatarUrl: null },
          ],
        },
      ]),
    );
    renderWithI18n(<Groups mode="detail" groupId={group.id} />);
    for (const [name, id] of [
      ["user-0", "invite-0"],
      ["Member", "invite-1"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: `Remove from group: ${name}` }));
      const dialog = screen.getByRole("dialog", { name: "Remove from group?" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove from group" }));
      await waitFor(() => expect(removeInvitation.mutateAsync).toHaveBeenCalledWith(id));
    }
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
  });

  it("retains accepted and pending invitations on edit, excludes declined invitations", async () => {
    const invited = ["ACCEPTED", "PENDING", "DECLINED"].map((status, index) => ({
      id: `invite-${index}`,
      groupId: group.id,
      inviteeUserId: `user-${index}`,
      status,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }));
    useGroupsMock.mockReturnValue(
      groups([
        {
          ...group,
          invitations: invited,
          memberProfiles: [
            ...group.memberProfiles,
            { id: "user-0", name: "Accepted", email: null, avatarUrl: null },
          ],
        },
      ]),
    );
    renderWithI18n(<Groups mode="edit" groupId={group.id} />);
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.getByText("user-1")).toBeTruthy();
    expect(screen.queryByText("user-2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({
        id: group.id,
        input: { name: group.name, isPublic: false, invitedUserIds: ["user-0", "user-1"] },
      }),
    );
  });

  it("shows accepted members without pending invitation IDs to non-admins", () => {
    useGroupsMock.mockReturnValue(
      groups([
        {
          ...group,
          adminUserId: "other",
          memberProfiles: [
            { id: "other", name: "Host", email: null, avatarUrl: null },
            { id: "admin", name: "Member", email: null, avatarUrl: null },
          ],
          invitations: [
            { id: "accepted", groupId: group.id, inviteeUserId: "admin", status: "ACCEPTED" },
            { id: "pending", groupId: group.id, inviteeUserId: "user_pending", status: "PENDING" },
          ],
        },
      ]),
    );
    renderWithI18n(<Groups mode="detail" groupId={group.id} />);
    expect(screen.getByText("Host")).toBeTruthy();
    expect(screen.getByText("Member")).toBeTruthy();
    expect(screen.queryByText("user_pending", { exact: true })).toBeNull();
  });

  it("accepts or declines invitation and preserves observable loading errors", () => {
    const invitation = {
      id: "22222222-2222-4222-8222-222222222222",
      groupId: group.id,
      inviteeUserId: "admin",
      status: "PENDING",
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
    useGroupsMock.mockReturnValue(
      groups([{ ...group, adminUserId: "other", invitations: [invitation] }]),
    );
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
    const detail = renderWithI18n(<Groups mode="detail" groupId={group.id} />);
    expect(screen.queryByRole("heading", { name: "Invitations" })).toBeNull();
    expect(screen.queryByText("Members are visible after accepting the invitation")).toBeNull();
    expect(screen.queryByText(invitation.inviteeUserId, { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(respond.mutate).toHaveBeenCalledWith({
      invitationId: invitation.id,
      decision: "accept",
    });
    detail.unmount();
    useGroupsMock.mockReturnValue({
      ...groups(undefined),
      list: { data: undefined, isPending: false, isError: true },
    });
    renderWithI18n(<Groups />);
    expect(screen.getByRole("alert").textContent).toBe("Could not load groups");
    expect(screen.queryByText("No groups yet")).toBeNull();
  });
});
