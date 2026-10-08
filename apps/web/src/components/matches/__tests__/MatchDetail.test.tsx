import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchDetail } from "@/components/matches/MatchDetail";
import { renderWithI18n } from "@/test-utils";
import { messages } from "../../../../../../messages/en.js";

const useMatchDetailMock = vi.fn();
const useMatchLeaderboardMock = vi.fn();
const contactMutation = () => ({ mutate: vi.fn(), isPending: false });
const contactQuery = () => ({ data: [], isSuccess: true, isError: false });
const useContactsMock = vi.fn(() => ({
  following: contactQuery(),
  followers: contactQuery(),
  friends: contactQuery(),
  pending: contactQuery(),
  sent: contactQuery(),
  blocked: contactQuery(),
  follow: contactMutation(),
  unfollow: contactMutation(),
  unfriend: contactMutation(),
  friendRequest: contactMutation(),
  cancelFriendRequest: contactMutation(),
  acceptFriendRequest: contactMutation(),
  rejectFriendRequest: contactMutation(),
  block: contactMutation(),
  unblock: contactMutation(),
  refreshContacts: vi.fn(),
}));
const authMock = vi.hoisted(() => ({ userId: "user_guest" }));
const routerMock = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const mutate = vi.fn();
const deleteMutate = vi.fn();
const leaveMutate = vi.fn();
const removeMutate = vi.fn();
const requestJoinMutate = vi.fn();
const approveJoinMutate = vi.fn();
const setChoiceMutate = vi.fn();
const favoriteMutate = vi.fn();
const favoriteState = {
  items: [],
  list: { isPending: false, isError: false },
  status: { isPending: false, isError: false, data: undefined as string[] | undefined },
  toggle: { isPending: false, mutate: favoriteMutate },
  isFavorite: vi.fn(() => false),
};
const setStatusMutate = vi.fn();

beforeAll(() => {
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: authMock.userId,
    getToken: vi.fn().mockResolvedValue("token"),
  }),
}));
vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  resolveApiUrl: () => "http://localhost:4000",
  useMatchDetail: (options: unknown) => useMatchDetailMock(options),
  useFavoriteLocations: () => favoriteState,
  useMatchLeaderboard: (options: unknown, gameId: number | null) =>
    useMatchLeaderboardMock(options, gameId),
  useContacts: () => useContactsMock(),
  matchContactState: (player: typeof detail.administrator) => ({
    user: { ...player, presence: { online: false, lastActiveAt: "" } },
    friendRequest: undefined,
    canSendFriendRequest: true,
  }),
}));
vi.mock("@/components/matches/MatchWizard", () => ({
  MatchWizard: ({ initialData }: { initialData: MatchDetailResponse }) => (
    <div>
      {`Edit wizard: ${initialData.match.name}`}
      <input aria-label="Draft name" defaultValue={initialData.match.name} />
    </div>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const invitation = {
  id: "11111111-1111-4111-8111-111111111111",
  matchId: "22222222-2222-4222-8222-222222222222",
  inviterUserId: "user_admin",
  inviteeUserId: "user_guest",
  status: "PENDING" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const detail: MatchDetailResponse = {
  match: {
    id: invitation.matchId,
    adminUserId: "user_admin",
    name: "Friday night games",
    dates: ["2026-09-12T18:00:00.000Z"],
    minPlayers: 2,
    maxPlayers: 4,
    invitedUserIds: ["user_guest"],
    gameIds: [1],
    status: "PLANNING" as const,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    invitations: [invitation],
  },
  administrator: {
    id: "user_admin",
    name: "Admin Player",
    email: "admin@example.com",
    avatarUrl: null,
  },
  invitedPlayers: [
    {
      id: "user_guest",
      name: "Guest Player",
      email: "guest@example.com",
      avatarUrl: null,
      invitation,
    },
  ],
  games: [{ id: 1, name: "Azul", yearPublished: 2017, thumbnail: null }],
};

function result(data: typeof detail | undefined = detail) {
  return {
    detail: { data, isPending: false, isError: false },
    respondInvitation: { mutate, isPending: false, isError: false },
    deleteMatch: { mutate: deleteMutate, isPending: false, isError: false },
    leaveMatch: { mutate: leaveMutate, isPending: false, isError: false },
    removePlayer: { mutate: removeMutate, isPending: false, isError: false },
    requestJoin: { mutate: requestJoinMutate, isPending: false, isError: false },
    approveJoinRequest: { mutate: approveJoinMutate, isPending: false, isError: false },
    setChoice: { mutate: setChoiceMutate, isPending: false },
    setStatus: { mutate: setStatusMutate, isPending: false },
    registerResults: { mutate: vi.fn(), isPending: false },
  };
}

describe("MatchDetail", () => {
  it("offers a join request to eligible viewers and shows network failures", () => {
    useMatchDetailMock.mockReturnValue({
      ...result({
        ...detail,
        canRequestJoin: true,
        match: { ...detail.match, isPublic: true, invitations: [], invitedUserIds: [] },
        invitedPlayers: [],
      }),
      requestJoin: { mutate: requestJoinMutate, isPending: false, isError: true },
    });
    renderWithI18n(<MatchDetail matchId={detail.match.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Request to join" }));
    expect(requestJoinMutate).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toBe("Could not request to join match");
  });
  it("requested viewers cannot self-approve or vote while waiting", () => {
    const requested = { ...invitation, kind: "REQUEST" as const };
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: { ...detail.match, invitations: [requested] },
        invitedPlayers: [{ ...detail.invitedPlayers[0], invitation: requested }],
      }),
    );
    renderWithI18n(<MatchDetail matchId={detail.match.id} />);
    expect(screen.getByText("Your join request is waiting for admin approval.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Request to join" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Leaderboards" })).toBeNull();
  });
  it("admin approves pending requests; other invitations retain response lifecycle", () => {
    authMock.userId = "user_admin";
    const requested = { ...invitation, kind: "REQUEST" as const };
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: { ...detail.match, invitations: [requested] },
        invitedPlayers: [{ ...detail.invitedPlayers[0], invitation: requested }],
      }),
    );
    renderWithI18n(<MatchDetail matchId={detail.match.id} />);
    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve join request: Guest Player" }));
    expect(approveJoinMutate).toHaveBeenCalledWith(invitation.id);
    expect(screen.getByRole("button", { name: "Remove player: Guest Player" })).toBeTruthy();
  });
  it("keeps cached hearts usable after refetch errors but blocks missing or pending status", () => {
    authMock.userId = "user_admin";
    const location = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Game cafe",
      address: "Main Street 10",
      longitude: 12.5,
      latitude: 41.9,
    };
    useMatchDetailMock.mockReturnValue(
      result({ ...detail, match: { ...detail.match, locations: [location] } }),
    );
    for (const state of [
      { isPending: true, isError: false, data: undefined, disabled: true },
      { isPending: false, isError: true, data: undefined, disabled: true },
      { isPending: false, isError: true, data: [], disabled: false },
    ]) {
      favoriteState.status.isPending = state.isPending;
      favoriteState.status.isError = state.isError;
      favoriteState.status.data = state.data;
      const { unmount } = renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
      expect(
        screen.getByRole("button", { name: "Add location to favorites" }).hasAttribute("disabled"),
      ).toBe(state.disabled);
      if (state.isError)
        expect(screen.getByRole("alert").textContent).toContain(
          "Could not load favorite locations",
        );
      unmount();
    }
  });

  it("toggles location hearts independently of votes and blocks repeated pending actions", () => {
    authMock.userId = "user_admin";
    const location = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Game cafe",
      address: "Main Street 10",
      longitude: 12.5,
      latitude: 41.9,
    };
    useMatchDetailMock.mockReturnValue(
      result({ ...detail, match: { ...detail.match, locations: [location] } }),
    );
    const { unmount } = renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    const add = screen.getByRole("button", { name: "Add location to favorites" });
    expect(add.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(location.name).className).toContain("text-sm font-medium");
    expect(screen.getByText(location.address).className).toContain("text-xs");
    fireEvent.click(add);
    expect(favoriteMutate).toHaveBeenCalledWith({
      location,
      favorite: false,
      matchId: invitation.matchId,
    });
    expect(setChoiceMutate).not.toHaveBeenCalled();
    favoriteState.isFavorite.mockReturnValue(true);
    favoriteState.toggle.isPending = true;
    unmount();
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    const remove = screen.getByRole("button", { name: "Remove location from favorites" });
    expect(remove.getAttribute("aria-pressed")).toBe("true");
    expect(remove.hasAttribute("disabled")).toBe(true);
    favoriteState.toggle.isPending = false;
    favoriteState.isFavorite.mockReturnValue(false);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    favoriteState.isFavorite.mockReturnValue(false);
    favoriteState.toggle.isPending = false;
    favoriteState.status.isPending = false;
    favoriteState.status.isError = false;
    favoriteState.status.data = undefined;
    authMock.userId = "user_guest";
    useMatchDetailMock.mockReturnValue(result());
    useMatchLeaderboardMock.mockReturnValue({
      data: {
        gameId: 1,
        ratings: [
          {
            userId: "user_admin",
            score: 500,
            provisional: true,
            gamesPlayed: 3,
            gamesWon: 1,
            nd: 1,
          },
          {
            userId: "user_guest",
            score: 498,
            provisional: false,
            gamesPlayed: 2,
            gamesWon: 0,
            nd: 0,
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it("shows immutable standings to accepted invitees and no admin actions after termination", () => {
    authMock.userId = "user_admin";
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: {
          ...detail.match,
          status: "TERMINATED",
          selectedDate: detail.match.dates[0],
          selectedGameId: 1,
          results: {
            lowerWins: true,
            finalizedAt: detail.match.updatedAt,
            entries: [
              { userId: "user_admin", score: "-2.5", rank: 1 },
              { userId: "user_guest", score: null, rank: null },
            ],
            tieBreaks: [],
          },
        },
        invitedPlayers: [
          { ...detail.invitedPlayers[0], invitation: { ...invitation, status: "ACCEPTED" } },
        ],
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    expect(screen.queryByRole("button", { name: "Register results" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More match actions" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit match" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Players" })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: "Results" }));
    expect(screen.getByText("-2.5")).toBeTruthy();
    expect(screen.getByText("ND")).toBeTruthy();
    expect(screen.getByText("Guest Player")).toBeTruthy();
    expect(screen.queryByText("guest@example.com")).toBeNull();
    expect(screen.queryByText("admin@example.com")).toBeNull();
    expect(screen.getAllByText("Not rated")).toHaveLength(2);
    expect(screen.getAllByRole("img", { name: "Rating unchanged: 0.00" })).toHaveLength(2);
    const ownRow = screen.getByText("Admin Player").closest("li");
    const guestRow = screen.getByText("Guest Player").closest("li");
    expect(
      ownRow && within(ownRow).getByRole("button", { name: "Actions" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      guestRow &&
        within(guestRow).getByRole("button", { name: "Actions" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.getByText("1").className).toContain("leading-none");
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByLabelText("Winner")).toBeTruthy();
    expect(screen.getByText("Admin Player").tagName).toBe("STRONG");
    fireEvent.click(screen.getByRole("tab", { name: "Leaderboards" }));
    expect(useMatchLeaderboardMock).toHaveBeenCalledWith(expect.anything(), 1);
    expect(screen.getByRole("heading", { name: "Azul" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Board game/ })).toBeNull();
    expect(screen.getByText("500.00")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Games played" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Games won" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Provisional rating" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Rating unchanged/ })).toBeNull();
  });

  it("selects proposed leaderboard games and excludes unaccepted players", async () => {
    const accepted = { ...invitation, status: "ACCEPTED" as const };
    const declined = {
      ...invitation,
      id: "declined",
      inviteeUserId: "user_declined",
      status: "DECLINED" as const,
    };
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: { ...detail.match, gameIds: [1, 2], invitations: [accepted, declined] },
        voteSummary: { dates: {}, games: {}, reasons: [] },
        games: [
          ...detail.games,
          {
            id: 2,
            name: "Cascadia",
            yearPublished: 2021,
            thumbnail: "data:image/svg+xml,%3Csvg/%3E",
          },
        ],
        invitedPlayers: [
          { ...detail.invitedPlayers[0], invitation: accepted },
          {
            id: "user_declined",
            name: "Declined Player",
            email: null,
            avatarUrl: null,
            invitation: declined,
          },
        ],
      }),
    );
    useMatchLeaderboardMock.mockReturnValue({
      data: {
        gameId: 2,
        ratings: [
          {
            userId: "user_admin",
            score: 500,
            provisional: true,
            gamesPlayed: 0,
            gamesWon: 0,
            nd: 0,
          },
          {
            userId: "user_guest",
            score: 490,
            provisional: false,
            gamesPlayed: 4,
            gamesWon: 2,
            nd: 1,
          },
          {
            userId: "user_declined",
            score: 510,
            provisional: false,
            gamesPlayed: 8,
            gamesWon: 3,
            nd: 0,
          },
        ],
      },
      isPending: false,
      isError: false,
    });
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    expect(screen.getAllByRole("button", { name: "Vote count legend" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Leaderboards" }));
    expect(useMatchLeaderboardMock).toHaveBeenCalledWith(expect.anything(), null);
    fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
    const cascadia = await screen.findByRole("option", { name: "Cascadia" });
    expect(cascadia.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/svg+xml,%3Csvg/%3E",
    );
    fireEvent.click(cascadia);
    expect(useMatchLeaderboardMock).toHaveBeenCalledWith(expect.anything(), 2);
    expect(screen.getByRole("button", { name: /Cascadia/ }).querySelector("img")).toBeTruthy();
    expect(screen.getByText("500.00")).toBeTruthy();
    expect(screen.getByText("490.00")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Games played" })).toBeTruthy();
    const guestRow = screen.getByRole("row", { name: /Guest Player/ });
    expect(within(guestRow).getByRole("rowheader").textContent).toContain("Guest Player");
    expect(
      within(guestRow)
        .getAllByRole("gridcell")
        .map((cell) => cell.textContent),
    ).toEqual(["4", "2", "1", "490.00"]);
    expect(screen.queryByText("Declined Player")).toBeNull();
  });

  it("shows an observable leaderboard error and retries", () => {
    authMock.userId = "user_admin";
    const refetch = vi.fn();
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: { ...detail.match, status: "CREATED", selectedGameId: 1 },
      }),
    );
    useMatchLeaderboardMock.mockReturnValue({ isPending: false, isError: true, refetch });
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    fireEvent.click(screen.getByRole("tab", { name: "Leaderboards" }));
    fireEvent.click(screen.getByRole("button", { name: "Could not load leaderboards. Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows emails instead of rankings for confirmed participants", () => {
    authMock.userId = "user_admin";
    const accepted = { ...invitation, status: "ACCEPTED" as const };
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: { ...detail.match, status: "CREATED", selectedGameId: 1, invitations: [accepted] },
        invitedPlayers: [{ ...detail.invitedPlayers[0], invitation: accepted }],
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    expect(screen.getByText("guest@example.com")).toBeTruthy();
    expect(screen.getByText("admin@example.com")).toBeTruthy();
    expect(screen.queryByText("500.00")).toBeNull();
    expect(screen.queryByRole("img", { name: "Game rating" })).toBeNull();
  });

  it("shows participant profiles and invitation status icons", () => {
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    expect(screen.getByText("Friday night games")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Leaderboards" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    expect(screen.getByText("Admin Player")).toBeTruthy();
    expect(screen.getByText("admin@example.com")).toBeTruthy();
    expect(screen.getByText("Guest Player")).toBeTruthy();
    expect(screen.getByText("guest@example.com")).toBeTruthy();
    expect(screen.getByLabelText("Administrator")).toBeTruthy();
    expect(screen.getByLabelText("Pending")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Remove player:/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByText("Azul")).toBeTruthy();
  });

  it("shows a game cover and publication year in overview", () => {
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        games: [
          {
            id: 1,
            name: "Azul",
            yearPublished: 2017,
            bayesAverage: 7.23456,
            average: 7.5,
            rank: 123,
            thumbnail: "https://cf.geekdo-images.com/a/thumb.jpg",
          },
        ],
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByText("2017")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Average: 7.50" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Rank: 123" })).toBeTruthy();
    expect(
      document.querySelector('img[src="https://cf.geekdo-images.com/a/thumb.jpg"]'),
    ).toBeTruthy();
  });

  it("lets an admin remove a pending player only after confirmation while planning", () => {
    authMock.userId = "user_admin";
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    expect(screen.getByLabelText("Pending").parentElement?.className).toContain("relative");
    fireEvent.click(screen.getByRole("button", { name: "Remove player: Guest Player" }));
    expect(screen.getByRole("dialog", { name: "Remove player?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(removeMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove player: Guest Player" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove player" }));
    expect(removeMutate).toHaveBeenCalledWith(
      invitation.id,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("allows removing accepted players while planning, never after confirmation", () => {
    authMock.userId = "user_admin";
    const accepted = { ...invitation, status: "ACCEPTED" as const };
    const data = {
      ...detail,
      match: { ...detail.match, invitations: [accepted] },
      invitedPlayers: [{ ...detail.invitedPlayers[0], invitation: accepted }],
    };
    useMatchDetailMock.mockReturnValue(result(data));
    const { rerender } = renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    expect(screen.getByRole("button", { name: "Remove player: Guest Player" })).toBeTruthy();
    useMatchDetailMock.mockReturnValue(
      result({ ...data, match: { ...data.match, status: "CREATED" as const } }),
    );
    rerender(
      <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: messages } })}>
        <MatchDetail matchId={invitation.matchId} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "Remove player: Guest Player" })).toBeNull();
  });

  it("keeps match participant visible after a social block and explains its scope", () => {
    authMock.userId = "user_admin";
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block" }));
    const dialog = screen.getByRole("dialog", { name: "Block contact" });
    expect(
      within(dialog).getByText(/Players remain in this match until they leave or are removed/),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Block" }));
    expect(useContactsMock.mock.results[0]?.value.block.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ targetUserId: "user_guest" }),
    );
    expect(screen.getByText("Guest Player")).toBeTruthy();
  });

  it("keeps pending invitation actions above the tabs", () => {
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    expect(screen.queryByRole("button", { name: "Leave match" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(mutate).toHaveBeenNthCalledWith(1, {
      invitationId: invitation.id,
      decision: "accept",
    });
    expect(mutate).toHaveBeenNthCalledWith(2, {
      invitationId: invitation.id,
      decision: "decline",
    });
  });

  it("opens the prefilled edit wizard only for the administrator", () => {
    expect(authMock.userId).toBe("user_guest");
    const guest = renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    expect(screen.queryByRole("button", { name: "Edit match" })).toBeNull();
    guest.unmount();

    authMock.userId = "user_admin";
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit match" }));
    expect(screen.getByText("Edit wizard: Friday night games")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to match" }));
    expect(screen.getByRole("button", { name: "Edit match" })).toBeTruthy();
  });

  it("keeps the unsaved edit mounted through refetch loading, errors and new data", () => {
    authMock.userId = "user_admin";
    const i18n = setupI18n({ locale: "en", messages: { en: messages } });
    const detailView = () => (
      <I18nProvider i18n={i18n}>
        <MatchDetail matchId={invitation.matchId} />
      </I18nProvider>
    );
    const view = render(detailView());
    fireEvent.click(screen.getByRole("button", { name: "Edit match" }));
    const draft = screen.getByRole("textbox", { name: "Draft name" }) as HTMLInputElement;
    fireEvent.change(draft, { target: { value: "Unsaved edit" } });

    useMatchDetailMock.mockReturnValue({
      ...result(undefined),
      detail: { data: undefined, isPending: true, isError: false },
    });
    view.rerender(detailView());
    expect(screen.getByRole("textbox", { name: "Draft name" })).toBe(draft);
    expect(draft.value).toBe("Unsaved edit");

    useMatchDetailMock.mockReturnValue({
      ...result(undefined),
      detail: { data: undefined, isPending: false, isError: true },
    });
    view.rerender(detailView());
    expect(screen.getByRole("textbox", { name: "Draft name" })).toBe(draft);

    useMatchDetailMock.mockReturnValue(
      result({ ...detail, match: { ...detail.match, name: "Changed remotely" } }),
    );
    view.rerender(detailView());
    expect(screen.getByText("Edit wizard: Friday night games")).toBeTruthy();
    expect(draft.value).toBe("Unsaved edit");
  });

  it("shows date/game choice menus only to admin or accepted invitees", () => {
    authMock.userId = "user_guest";
    const view = renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    expect(screen.queryByRole("button", { name: /Choose date/ })).toBeNull();
    view.unmount();

    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: { ...detail.match, invitations: [{ ...invitation, status: "ACCEPTED" }] },
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    const dateAction = screen.getByRole("button", { name: /Choose date/ });
    expect(dateAction.className).toContain("button--outline");
    expect(dateAction.querySelector("svg.lucide-minus")).toBeTruthy();
    fireEvent.click(dateAction);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Yes" }));
    expect(setChoiceMutate).toHaveBeenCalledWith({
      kind: "dates",
      itemId: detail.match.dates[0],
      choice: "YES",
    });
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    const gameAction = screen.getByRole("button", { name: /Choose game/ });
    expect(gameAction.className).toContain("button--outline");
    expect(gameAction.querySelector("svg.lucide-minus")).toBeTruthy();
  });

  it("allows only the admin to confirm and reopen a match and hides choices after confirmation", () => {
    authMock.userId = "user_admin";
    const ready = {
      dates: {
        [String(Date.parse(detail.match.dates[0]))]: { yes: 2, no: 0, ifNeeded: 0, notChosen: 0 },
      },
      games: { "1": { yes: 1, no: 0, ifNeeded: 1, notChosen: 0 } },
      reasons: [],
      selectedDate: detail.match.dates[0],
      selectedGameId: 1,
    };
    useMatchDetailMock.mockReturnValue(result({ ...detail, voteSummary: ready }));
    const view = renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    expect(screen.getByRole("img", { name: /Yes: 2, No: 0/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm match" }));
    expect(setStatusMutate).not.toHaveBeenCalled();
    const confirmDialog = screen.getByRole("dialog", { name: "Confirm match?" });
    expect(within(confirmDialog).getByText(/Azul/)).toBeTruthy();
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Confirm match" }));
    expect(setStatusMutate).toHaveBeenCalledWith(
      "CREATED",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    view.unmount();

    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: {
          ...detail.match,
          status: "CREATED",
          selectedDate: detail.match.dates[0],
          selectedGameId: 1,
          invitedUserIds: [],
          invitations: [],
        },
        invitedPlayers: [],
        voteSummary: ready,
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    expect(screen.getByText("Confirmed date")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Vote count legend" })).toBeNull();
    expect(screen.queryByRole("img", { name: /Yes: 2, No: 0/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Choose date/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    expect(screen.queryByText("Minimum players")).toBeNull();
    expect(screen.queryByText("Maximum players")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByRole("heading", { name: "Confirmed game" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Vote count legend" })).toBeNull();
    expect(screen.queryByRole("img", { name: /Yes: 1, No: 0/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Choose game/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More match actions" }));
    expect(
      screen.getByRole("button", { name: "Back to planning" }).parentElement?.parentElement
        ?.className,
    ).toContain("gap-3");
    fireEvent.click(screen.getByRole("button", { name: "Back to planning" }));
    expect(screen.getByRole("dialog", { name: "Back to planning?" })).toBeTruthy();
    expect(setStatusMutate).not.toHaveBeenCalledWith("PLANNING", expect.anything());
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Back to planning?" })).getByRole("button", {
        name: "Back to planning",
      }),
    );
    expect(setStatusMutate).toHaveBeenCalledWith(
      "PLANNING",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows colored choice counts and a compact legend tooltip beside option headings", async () => {
    authMock.userId = "user_admin";
    const key = String(Date.parse(detail.match.dates[0]));
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        voteSummary: {
          dates: { [key]: { yes: 1, no: 1, ifNeeded: 0, notChosen: 0 } },
          games: { "1": { yes: 0, no: 1, ifNeeded: 1, notChosen: 0 } },
          reasons: ["NO_SHARED_DATE", "NO_SHARED_GAME"],
        },
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    expect(
      screen.getByRole("heading", { name: "Date selection" }).closest('[data-slot="card"]'),
    ).toBeNull();
    const votes = screen.getByRole("img", { name: "Yes: 1, No: 1, If needed: 0, Not chosen: 0" });
    expect(within(votes).getByText("✓ 1").className).toContain("text-success");
    expect(within(votes).getByText("× 1").className).toContain("text-danger");
    expect(within(votes).getByText("~ 0").className).toContain("text-warning");
    expect(within(votes).getByText("- 0").className).toContain("text-default-500");
    fireEvent.focus(screen.getByRole("button", { name: "Vote count legend" }));
    expect(await screen.findByText("- Not chosen")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(
      screen.getByRole("heading", { name: "Game selection" }).closest('[data-slot="card"]'),
    ).toBeNull();
    expect(
      screen.getByRole("img", { name: "Yes: 0, No: 1, If needed: 1, Not chosen: 0" }),
    ).toBeTruthy();
  });

  it("keeps confirmation unavailable while votes are missing and shows the reason on focus", async () => {
    authMock.userId = "user_admin";
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        voteSummary: {
          dates: {},
          games: {},
          reasons: ["NOT_ENOUGH_PLAYERS", "NO_SHARED_DATE", "NO_SHARED_GAME"],
        },
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    const button = screen.getByRole("button", { name: "Confirm match" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.focus(button);
    expect(
      await screen.findByText(/Not enough accepted players · No shared date · No shared game/),
    ).toBeTruthy();
    fireEvent.click(button);
    expect(setStatusMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Confirm match?" })).toBeNull();
  });

  it("changes date and game icons with the selected choice", () => {
    authMock.userId = "user_admin";
    const dateKey = String(Date.parse(detail.match.dates[0]));
    useMatchDetailMock.mockReturnValue(
      result({ ...detail, choices: { dates: { [dateKey]: "YES" }, games: { "1": "NO" } } }),
    );
    const view = renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    const dateAction = screen.getByRole("button", { name: "Choose date: Yes" });
    expect(dateAction.className).toContain("text-success");
    expect(dateAction.querySelector("svg.lucide-circle-check")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    const gameAction = screen.getByRole("button", { name: "Choose game: No" });
    expect(gameAction.className).toContain("text-danger");
    expect(gameAction.querySelector("svg.lucide-circle-x")).toBeTruthy();
    view.unmount();

    useMatchDetailMock.mockReturnValue(
      result({ ...detail, choices: { dates: { [dateKey]: "IF_NEEDED" }, games: {} } }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    const warningAction = screen.getByRole("button", { name: "Choose date: If I have to" });
    expect(warningAction.className).toContain("text-warning");
    expect(warningAction.textContent).toContain("~");
    expect(warningAction.querySelector("svg.lucide-circle-alert")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(
      screen
        .getByRole("button", { name: "Choose game: Not known" })
        .querySelector("svg.lucide-minus"),
    ).toBeTruthy();
  });

  it("confirms match deletion for admins", () => {
    authMock.userId = "user_admin";
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    fireEvent.click(screen.getByRole("button", { name: "More match actions" }));
    const menuAction = screen.getByRole("button", { name: "Delete match" });
    expect(menuAction.textContent).toBe("");
    expect(menuAction.nextElementSibling?.textContent).toBe("Delete match");
    fireEvent.click(menuAction);
    const dialog = screen.getByRole("dialog", { name: "Delete match?" });
    expect(
      within(dialog).getByText(
        "This deletes the match and all invitations. This action cannot be undone.",
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete match" }));

    expect(deleteMutate).toHaveBeenCalledWith(
      invitation.matchId,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    deleteMutate.mock.calls[0]?.[1].onSuccess();
    expect(routerMock.replace).toHaveBeenCalledWith("/matches");
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(leaveMutate).not.toHaveBeenCalled();
  });

  it("confirms departure only for accepted invitees", () => {
    const accepted = { ...invitation, status: "ACCEPTED" as const };
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: { ...detail.match, invitations: [accepted] },
        invitedPlayers: [
          {
            id: "user_guest",
            name: "Guest Player",
            email: "guest@example.com",
            avatarUrl: null,
            invitation: accepted,
          },
        ],
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    fireEvent.click(screen.getByRole("button", { name: "Leave match" }));
    const dialog = screen.getByRole("dialog", { name: "Leave match?" });
    expect(
      within(dialog).getByText(
        "You will leave this match. The administrator can invite you again.",
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave match" }));

    expect(leaveMutate).toHaveBeenCalledWith(
      invitation.id,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    leaveMutate.mock.calls[0]?.[1].onSuccess();
    expect(routerMock.replace).toHaveBeenCalledWith("/matches");
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("keeps the administrator visible when there are no invitees", () => {
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: { ...detail.match, invitedUserIds: [], invitations: [] },
        invitedPlayers: [],
        games: [],
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    expect(screen.getByText("Admin Player")).toBeTruthy();
    expect(screen.queryByText("No invited players")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByText("No selected games")).toBeTruthy();
  });

  it("shows accepted and declined invitation states", () => {
    const accepted = { ...invitation, status: "ACCEPTED" as const };
    const declined = {
      ...invitation,
      id: "33333333-3333-4333-8333-333333333333",
      inviteeUserId: "user_other",
      status: "DECLINED" as const,
    };
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        match: { ...detail.match, invitations: [accepted, declined] },
        invitedPlayers: [
          {
            id: "user_guest",
            name: "Guest Player",
            email: "guest@example.com",
            avatarUrl: null,
            invitation: accepted,
          },
          {
            id: "user_other",
            name: "Other Player",
            email: "other@example.com",
            avatarUrl: null,
            invitation: declined,
          },
        ],
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    expect(screen.getAllByLabelText("Accepted")).toHaveLength(2);
    expect(screen.getByLabelText("Declined")).toBeTruthy();
  });

  it("shows invitation response errors", () => {
    useMatchDetailMock.mockReturnValue({
      ...result(),
      respondInvitation: { mutate, isPending: false, isError: true },
    });
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    expect(screen.getByText("Could not update the invitation")).toBeTruthy();
  });

  it("shows an observable detail error", () => {
    useMatchDetailMock.mockReturnValue({
      detail: { data: undefined, isPending: false, isError: true },
      respondInvitation: { mutate, isPending: false, isError: false },
    });
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    expect(screen.getByText("Could not load match details")).toBeTruthy();
  });
});
