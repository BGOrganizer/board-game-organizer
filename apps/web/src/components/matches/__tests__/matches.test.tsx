import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Matches } from "@/components/matches/Matches";
import { MatchWizard } from "@/components/matches/MatchWizard";
import { renderWithI18n } from "@/test-utils";

const useMatchesMock = vi.fn();
const favoriteMutate = vi.fn();
const favoriteState = {
  items: [],
  list: { isPending: false, isError: false },
  status: { isPending: false, isError: false },
  toggle: { isPending: false, mutate: favoriteMutate },
  isFavorite: () => false,
};
const testLocation = {
  id: "8b1f8d7e-b32b-4c56-b0de-190748935516",
  name: "Game cafe",
  address: "123 Main St",
  longitude: 12.5,
  latitude: 41.9,
};
vi.mock("@/components/locations/SearchLocationPage", () => ({
  SearchLocationPage: ({ onSelect }: { onSelect: (location: typeof testLocation) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: "8b1f8d7e-b32b-4c56-b0de-190748935516",
          name: "Game cafe",
          address: "123 Main St",
          longitude: 12.5,
          latitude: 41.9,
        })
      }
    >
      Pick test location
    </button>
  ),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_guest",
    getToken: vi.fn().mockResolvedValue("token"),
  }),
}));

vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  resolveApiUrl: (url?: string | null) => url || "http://localhost:4000",
  useMatches: (opts: unknown) => useMatchesMock(opts),
  useFavoriteLocations: () => favoriteState,
  useGroups: () => ({ list: { data: [], isPending: false, isError: false } }),
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
          locations: [testLocation],
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

  it("keeps match group optional in the HeroUI select", () => {
    renderWithI18n(<MatchWizard onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Group \(optional\)/ }));
    expect(screen.getByRole("option", { name: "No group" })).toBeTruthy();
  });

  it("starts with all roles selected and combines chips with debounced search", async () => {
    renderWithI18n(<Matches />);
    for (const role of ["Admin", "Invited", "Accepted"])
      expect(screen.getByRole("button", { name: role }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect(screen.getByRole("button", { name: "Admin" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(useMatchesMock.mock.lastCall?.[0].listFilters.roles).toEqual(["invited", "accepted"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search matches" }), {
      target: { value: "Cat" },
    });
    expect(useMatchesMock.mock.lastCall?.[0].listFilters.query).toBe("");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search matches" }), {
      target: { value: "Catan" },
    });
    await waitFor(() => expect(useMatchesMock.mock.lastCall?.[0].listFilters.query).toBe("Catan"));
    expect(useMatchesMock.mock.lastCall?.[0].listFilters.roles).toEqual(["invited", "accepted"]);
  });

  it("lists the matches with name, dates and player range", () => {
    renderWithI18n(<Matches />);
    expect(screen.getByText("Friday night games")).toBeTruthy();
    expect(screen.getByText("3/5")).toBeTruthy();
    expect(screen.getByText("1 game")).toBeTruthy();
    expect(screen.getByText("Planning").closest('[data-slot="chip"]')?.className).toContain(
      "chip--warning",
    );
    expect(document.querySelector('img.match-waves[src^="data:image/svg+xml,"]')).toBeTruthy();
    expect(
      screen.getByText(
        new Date(baseMock.list.data[0].dates[0]).toLocaleDateString("en", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }),
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Player")).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search matches" })).toBeTruthy();
  });

  it.each([2, 3])("shows first location and remaining count for %i proposed locations", (count) => {
    const location = { ...testLocation, address: "Via Roma 12, Milano, Italy" };
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: {
        ...baseMock.list,
        data: [
          {
            ...baseMock.list.data[0],
            locations: Array.from({ length: count }, (_, i) => ({ ...location, id: String(i) })),
          },
        ],
      },
    });
    renderWithI18n(<Matches />);
    const row = screen.getByTestId("match-location");
    expect(row.textContent).toContain("Via Roma 12, Milano");
    expect(row.textContent).not.toContain("Italy");
    expect(screen.getByText(count === 2 ? "+1 location" : "+2 locations")).toBeTruthy();
    expect(row.querySelector("[title]")?.getAttribute("title")).toBe(location.name);
  });

  it("shows confirmed location only and hides legacy missing locations", () => {
    const other = { ...testLocation, id: "other", name: "Confirmed café" };
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: {
        ...baseMock.list,
        data: [
          {
            ...baseMock.list.data[0],
            status: "CREATED",
            selectedLocationId: other.id,
            locations: [testLocation, other],
          },
        ],
      },
    });
    const view = renderWithI18n(<Matches />);
    expect(screen.getByTestId("match-location").textContent).toContain(other.name);
    expect(screen.queryByText("+1 location")).toBeNull();
    view.unmount();
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: { ...baseMock.list, data: [{ ...baseMock.list.data[0], locations: undefined }] },
    });
    renderWithI18n(<Matches />);
    expect(screen.queryByTestId("match-location")).toBeNull();
  });

  it("lists only the confirmed date for a created match", () => {
    const listedMatch = baseMock.list.data[0];
    if (!listedMatch) throw new Error("Expected match fixture");
    const selectedDate = "2026-09-06T20:00:00.000Z";
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: {
        ...baseMock.list,
        data: [
          {
            ...listedMatch,
            status: "CREATED",
            dates: [...listedMatch.dates, selectedDate],
            selectedDate,
            selectedGameId: 342942,
            selectedGameName: "Cascadia",
          },
        ],
      },
    });
    renderWithI18n(<Matches />);
    expect(screen.getByText("Confirmed").closest('[data-slot="chip"]')?.className).toContain(
      "chip--success",
    );
    expect(
      screen.getByText(
        new Date(selectedDate).toLocaleDateString("en", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        new Date(listedMatch.dates[0]).toLocaleDateString("en", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }),
      ),
    ).toBeNull();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Cascadia")).toBeTruthy();
    expect(screen.queryByText("1 game")).toBeNull();
  });

  it("identifies matches administered by the current user", () => {
    const listedMatch = baseMock.list.data[0];
    if (!listedMatch) throw new Error("Expected match fixture");
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: { ...baseMock.list, data: [{ ...listedMatch, adminUserId: "user_guest" }] },
    });

    renderWithI18n(<Matches />);

    const crown = screen.getByLabelText("Administrator");
    expect(crown.parentElement?.querySelector("img.match-waves")).toBeTruthy();
  });

  it("shows the next date and number of remaining dates", () => {
    const listedMatch = baseMock.list.data[0];
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: {
        ...baseMock.list,
        data: [{ ...listedMatch, dates: ["2099-10-12T20:00:00Z", "2099-10-10T20:00:00Z"] }],
      },
    });
    renderWithI18n(<Matches />);
    expect(
      screen.getByText(
        new Date("2099-10-10T20:00:00Z").toLocaleDateString("en", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }),
      ),
    ).toBeTruthy();
    expect(screen.getByText("+1 date")).toBeTruthy();
  });

  it("pluralizes remaining match dates", () => {
    const listedMatch = baseMock.list.data[0];
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: {
        ...baseMock.list,
        data: [
          {
            ...listedMatch,
            dates: ["2099-10-12T20:00:00Z", "2099-10-10T20:00:00Z", "2099-10-11T20:00:00Z"],
          },
        ],
      },
    });
    renderWithI18n(<Matches />);
    expect(screen.getByText("+2 dates")).toBeTruthy();
  });

  it("identifies every tied first-place player after termination", () => {
    const listedMatch = baseMock.list.data[0];
    useMatchesMock.mockReturnValue({
      ...baseMock,
      list: {
        ...baseMock.list,
        data: [
          {
            ...listedMatch,
            status: "TERMINATED",
            selectedDate: listedMatch.dates[0],
            selectedGameName: "Cascadia",
            winnerNames: ["Anna Rossi", "Marco Verdi"],
          },
        ],
      },
    });
    renderWithI18n(<Matches />);
    const winners = screen.getByText(/Anna Rossi Marco Verdi/);
    expect(winners.tagName).toBe("STRONG");
    expect(winners.textContent).toBe("Anna Rossi\nMarco Verdi");
    expect(winners.className).toContain("whitespace-pre-line");
    expect(screen.getByLabelText("Winners").getAttribute("class")).toContain("lucide-medal");
  });

  it("opens the wizard when the create FAB is pressed", () => {
    renderWithI18n(<Matches />);
    fireEvent.click(screen.getByLabelText(/create a match/i));
    expect(screen.getByText("New match")).toBeTruthy();
  });

  it("clears the sole date and removes extra dates without hiding the last input", () => {
    renderWithI18n(<MatchWizard />);

    expect(screen.queryByRole("button", { name: "Remove slot" })).toBeNull();
    const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    expect(input.closest("ul")?.className).toContain("rounded-xl bg-surface");
    const next = screen.getByRole("button", { name: "Next step" }) as HTMLButtonElement;
    fireEvent.change(screen.getByPlaceholderText(/Friday night games/i), {
      target: { value: "Friday night games" },
    });
    fireEvent.change(input, { target: { value: "2099-09-05T20:00" } });
    expect(next.disabled).toBe(false);
    const first = screen.getByRole("button", { name: "Remove slot" }) as HTMLButtonElement;
    fireEvent.click(first);
    expect(input.value).toBe("");
    expect(screen.queryByRole("button", { name: "Remove slot" })).toBeNull();
    expect(document.querySelector('input[type="datetime-local"]')).toBe(input);
    expect(next.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "2099-09-05T20:00" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByRole("button", { name: "Remove slot" })).toBeNull();
    expect(next.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "2099-09-05T20:00" } });
    const addDate = screen.getByRole("button", { name: "Add date" });
    expect(addDate.className).toContain("button--primary");
    expect(addDate.className).toContain("button--sm");
    fireEvent.click(addDate);

    const removeButtons = screen.getAllByRole("button", { name: "Remove slot" });
    expect(removeButtons).toHaveLength(2);
    const last = removeButtons.at(-1) as HTMLButtonElement;
    expect(last.className).toContain("button--danger-soft");
    expect(last.querySelector("svg")?.getAttribute("class")).toContain("lucide-trash");
    expect(last.parentElement?.querySelector('input[type="datetime-local"]')).not.toBeNull();
    fireEvent.click(last);
    expect(screen.getAllByRole("button", { name: "Remove slot" })).toHaveLength(1);
    expect(input.value).toBe("2099-09-05T20:00");
    expect(next.disabled).toBe(false);
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

    let next = screen.getByLabelText("Next step") as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(await screen.findByText("Locations")).toBeTruthy();
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Select location" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick test location" }));
    next = screen.getByLabelText("Next step") as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(await screen.findByText("Players")).toBeTruthy();
    for (const friend of screen.getAllByRole("button", { name: "Select a friend" })) {
      expect(friend.className).toContain("button--ghost");
      expect(friend.closest("ul")?.className).toContain("rounded-xl bg-surface");
    }

    const min = screen.getByText("Min").parentElement;
    expect(min?.textContent).toBe("Min2");
    fireEvent.click(screen.getByLabelText("Decrease min players"));
    expect(min?.textContent).toBe("Min2");
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    expect(await screen.findByText("Board games")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create match" }).querySelector("svg.lucide-save"),
    ).toBeTruthy();
    const game = screen.getByRole("button", { name: "Select a board game" });
    expect(game.className).toContain("button--ghost");
    expect(game.closest("ul")?.className).toContain("rounded-xl bg-surface");

    const addGame = screen.getByRole("button", { name: "Add game" });
    expect(addGame.className).toContain("button--primary");
    expect(addGame.className).toContain("button--sm");
    fireEvent.click(addGame);
    expect(screen.getAllByRole("button", { name: "Select a board game" })).toHaveLength(2);
    const removeGame = screen.getAllByRole("button", { name: "Remove game" }).at(-1);
    expect(removeGame?.className).toContain("button--danger-soft");
    expect(removeGame?.querySelector("svg")?.getAttribute("class")).toContain("lucide-trash");
    expect(removeGame?.parentElement?.querySelectorAll("button")).toHaveLength(2);
    if (removeGame) fireEvent.click(removeGame);
    expect(screen.getAllByRole("button", { name: "Select a board game" })).toHaveLength(1);
  });

  it("starts private and permits public requests only for ungrouped matches", () => {
    const view = renderWithI18n(<MatchWizard />);
    const visibility = screen.getByRole("switch", { name: "Public match" });
    expect((visibility as HTMLInputElement).checked).toBe(false);
    fireEvent.click(visibility);
    expect(screen.getByText("Public match")).toBeTruthy();
    expect(
      screen.getByText(
        "Anyone with the match link can request to join while planning and with free slots. The admin approves requests.",
      ),
    ).toBeTruthy();
    view.unmount();
    renderWithI18n(
      <MatchWizard
        initialData={{
          match: {
            ...baseMock.list.data[0],
            status: "PLANNING",
            groupId: "group-id",
            isPublic: true,
          },
          administrator: {
            id: "user_1",
            name: "Admin",
            email: "admin@example.com",
            avatarUrl: null,
          },
          invitedPlayers: [],
          games: [],
        }}
      />,
    );
    const grouped = screen.getByRole("switch", { name: "Public match" });
    expect((grouped as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByText(
        "Group matches are private. Only group members can request to join, with admin approval.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Private match")).toBeTruthy();
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
    expect(screen.getByText("Locations")).toBeTruthy();
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
    expect(screen.getByLabelText("Save changes").querySelector("svg.lucide-save")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Save changes"));

    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({
        matchId: "m1",
        input: {
          name: "Friday night games",
          dates: ["2026-09-05T20:00:00.000Z"],
          locations: [testLocation],
          minPlayers: 3,
          maxPlayers: 5,
          invitedUserIds: [],
          gameIds: [342942],
          groupId: null,
          isPublic: false,
        },
      }),
    );
  });

  it("opens a match detail", () => {
    renderWithI18n(<Matches />);

    expect(
      screen.getByRole("link", { name: /^Open match: Friday night games/ }).getAttribute("href"),
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

    const acceptButton = screen.getByRole("button", { name: "Accept" });
    expect(acceptButton.textContent).toBe("");
    expect(acceptButton.parentElement?.className).toContain("bg-surface");
    expect(acceptButton.className).toContain("bg-surface text-success");
    fireEvent.click(acceptButton);
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
