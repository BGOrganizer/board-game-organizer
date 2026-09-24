import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Matches } from "@/components/Matches";
import { MatchWizard } from "@/components/MatchWizard";
import { renderWithI18n } from "@/test-utils";

const useMatchesMock = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_guest",
    getToken: vi.fn().mockResolvedValue("token"),
  }),
}));

vi.mock("@board-game-organizer/shared", () => ({
  resolveApiUrl: (url?: string | null) => url || "http://localhost:4000",
  useMatches: (opts: unknown) => useMatchesMock(opts),
}));

describe("Matches", () => {
  const baseMock = {
    list: {
      isPending: false,
      isError: false,
      data: [
        {
          id: "m1",
          adminUserId: "user_admin",
          name: "Friday night games",
          dates: ["2026-09-05T20:00:00.000Z"],
          minPlayers: 3,
          maxPlayers: 5,
          invitedUserIds: [],
          gameIds: [342942],
          status: "PLANNING",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
          invitations: [],
        },
      ],
    },
    create: { isError: false, mutateAsync: vi.fn(), isPending: false },
    update: { isError: false, mutateAsync: vi.fn(), isPending: false },
    search: { isPending: false, isError: false, mutate: vi.fn(), data: null },
    thing: { isPending: false, isError: false, mutate: vi.fn(), data: null },
    respondInvitation: { isPending: false, isError: false, mutate: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useMatchesMock.mockReturnValue(baseMock);
  });

  it("lists the matches with name, dates and player range", () => {
    renderWithI18n(<Matches />);
    expect(screen.getByText("Friday night games")).toBeTruthy();
    expect(screen.getByText(/3–5/)).toBeTruthy();
    expect(screen.getByLabelText("Player")).toBeTruthy();
    expect(screen.getByText("Matches")).toBeTruthy();
  });

  it("identifies matches administered by the current user", () => {
    const listedMatch = baseMock.list.data[0];
    if (!listedMatch) throw new Error("Expected match fixture");
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: { ...baseMock.list, data: [{ ...listedMatch, adminUserId: "user_guest" }] },
    });

    renderWithI18n(<Matches />);

    expect(screen.getByLabelText("Administrator")).toBeTruthy();
  });

  it("opens the wizard when the create FAB is pressed", () => {
    renderWithI18n(<Matches />);
    fireEvent.click(screen.getByLabelText(/create a match/i));
    expect(screen.getByText("New match")).toBeTruthy();
  });

  it("keeps the red trash button inside each date item", () => {
    renderWithI18n(<MatchWizard />);

    const first = screen.getByRole("button", { name: "Remove slot" }) as HTMLButtonElement;
    expect(first.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add another date" }));

    const removeButtons = screen.getAllByRole("button", { name: "Remove slot" });
    const last = removeButtons.at(-1) as HTMLButtonElement;
    expect(last.className).toContain("button--danger-soft");
    expect(last.querySelector("svg")?.getAttribute("class")).toContain("lucide-trash");
    expect(last.parentElement?.querySelector('input[type="datetime-local"]')).not.toBeNull();
    fireEvent.click(last);
    expect(screen.getAllByRole("button", { name: "Remove slot" })).toHaveLength(1);
  });

  it("allows a planning match without invites and keeps the minimum at two", async () => {
    renderWithI18n(<Matches />);
    fireEvent.click(screen.getByLabelText(/create a match/i));
    fireEvent.change(screen.getByPlaceholderText(/Friday night games/i), {
      target: { value: "Friday night games" },
    });
    const dateInput = document.querySelector('input[type="datetime-local"]');
    expect(dateInput).not.toBeNull();
    fireEvent.change(dateInput as HTMLInputElement, { target: { value: "2099-09-05T20:00" } });

    const next = screen.getByLabelText("Next step") as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(await screen.findByText("Players")).toBeTruthy();

    const min = screen.getByText("Min").parentElement;
    expect(min?.textContent).toBe("Min2");
    fireEvent.click(screen.getByLabelText("Decrease min players"));
    expect(min?.textContent).toBe("Min2");
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    expect(await screen.findByText("Board games")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add another game" }));
    expect(screen.getAllByRole("button", { name: "Select a board game" })).toHaveLength(2);
    const removeGame = screen.getAllByRole("button", { name: "Remove game" }).at(-1);
    expect(removeGame?.className).toContain("button--danger-soft");
    expect(removeGame?.querySelector("svg")?.getAttribute("class")).toContain("lucide-trash");
    expect(removeGame?.parentElement?.querySelectorAll("button")).toHaveLength(2);
    if (removeGame) fireEvent.click(removeGame);
    expect(screen.getAllByRole("button", { name: "Select a board game" })).toHaveLength(1);
  });

  it("prefills the edit wizard and defers invitation removal until final save", async () => {
    const update = { isError: false, mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
    useMatchesMock.mockReturnValue({ ...baseMock, update });
    renderWithI18n(
      <MatchWizard
        initialData={{
          match: {
            ...baseMock.list.data[0],
            adminUserId: "user_guest",
            status: "PLANNING" as const,
            invitedUserIds: ["user_friend"],
            invitations: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                matchId: "22222222-2222-4222-8222-222222222222",
                inviterUserId: "user_guest",
                inviteeUserId: "user_friend",
                status: "ACCEPTED",
                createdAt: "2026-09-01T00:00:00.000Z",
                updatedAt: "2026-09-01T00:00:00.000Z",
              },
            ],
          },
          administrator: {
            id: "user_guest",
            name: "Admin Player",
            email: "admin@example.com",
            avatarUrl: null,
          },
          invitedPlayers: [
            {
              id: "user_friend",
              name: "Guest Player",
              email: "guest@example.com",
              avatarUrl: null,
              invitation: {
                id: "11111111-1111-4111-8111-111111111111",
                matchId: "22222222-2222-4222-8222-222222222222",
                inviterUserId: "user_guest",
                inviteeUserId: "user_friend",
                status: "ACCEPTED",
                createdAt: "2026-09-01T00:00:00.000Z",
                updatedAt: "2026-09-01T00:00:00.000Z",
              },
            },
          ],
          games: [{ id: 342942, name: "Cascadia", yearPublished: 2021, thumbnail: null }],
        }}
      />,
    );

    expect(screen.getByText("Edit match")).toBeTruthy();
    expect((screen.getByLabelText("Match name") as HTMLInputElement).value).toBe(
      "Friday night games",
    );
    fireEvent.click(screen.getByLabelText("Next step"));
    expect(screen.getByText("Guest Player")).toBeTruthy();
    const removeInvite = screen.getByRole("button", { name: "Remove invite" });
    expect(removeInvite.className).toContain("button--danger-soft");
    expect(removeInvite.querySelector("svg")?.getAttribute("class")).toContain("lucide-trash");
    expect(removeInvite.parentElement?.querySelectorAll("button")).toHaveLength(2);
    fireEvent.click(removeInvite);
    expect(update.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Next step"));
    expect(screen.getByText("Cascadia")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Save changes"));

    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({
        matchId: "m1",
        input: {
          name: "Friday night games",
          dates: ["2026-09-05T20:00:00.000Z"],
          minPlayers: 3,
          maxPlayers: 5,
          invitedUserIds: [],
          gameIds: [342942],
        },
      }),
    );
  });

  it("opens a match detail", () => {
    renderWithI18n(<Matches />);

    expect(
      screen.getByRole("link", { name: "Open match: Friday night games" }).getAttribute("href"),
    ).toBe("/matches/m1");
  });

  it("accepts or declines a pending invitation from the match card", () => {
    const mutate = vi.fn();
    const listedMatch = baseMock.list.data[0];
    if (!listedMatch) throw new Error("Expected match fixture");
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: {
        ...baseMock.list,
        data: [
          {
            ...listedMatch,
            invitedUserIds: ["user_guest"],
            invitations: [
              {
                id: "invitation-1",
                matchId: "m1",
                inviterUserId: "user_admin",
                inviteeUserId: "user_guest",
                status: "PENDING",
                createdAt: "2026-09-01T00:00:00.000Z",
                updatedAt: "2026-09-01T00:00:00.000Z",
              },
            ],
          },
        ],
      },
      respondInvitation: { isPending: false, isError: false, mutate },
    });
    renderWithI18n(<Matches />);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(mutate).toHaveBeenNthCalledWith(1, {
      invitationId: "invitation-1",
      decision: "accept",
    });
    expect(mutate).toHaveBeenNthCalledWith(2, {
      invitationId: "invitation-1",
      decision: "decline",
    });
  });

  it("shows invitation response errors", () => {
    useMatchesMock.mockReturnValue({
      ...baseMock,
      respondInvitation: { isPending: false, isError: true, mutate: vi.fn() },
    });
    renderWithI18n(<Matches />);

    expect(screen.getByText("Could not update the invitation")).toBeTruthy();
  });

  it("shows the empty state when there are no matches", () => {
    useMatchesMock.mockReturnValueOnce({
      list: { isPending: false, isError: false, data: [] },
      create: { isError: false, mutateAsync: vi.fn(), isPending: false },
      update: { isError: false, mutateAsync: vi.fn(), isPending: false },
      search: { isPending: false, isError: false, mutate: vi.fn(), data: null },
      thing: { isPending: false, isError: false, mutate: vi.fn(), data: null },
      respondInvitation: { isPending: false, isError: false, mutate: vi.fn() },
    });
    renderWithI18n(<Matches />);
    expect(screen.getByText(/No matches yet/)).toBeTruthy();
  });
});
