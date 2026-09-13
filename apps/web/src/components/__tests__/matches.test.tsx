import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Matches } from "@/components/Matches";
import { renderWithI18n } from "@/test-utils";

const useMatchesMock = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
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
          name: "Friday night games",
          dates: ["2026-09-05T20:00:00.000Z"],
          minPlayers: 3,
          maxPlayers: 5,
          invitedUserIds: [],
          gameIds: [342942],
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    },
    create: { isError: false, mutateAsync: vi.fn(), isPending: false },
    search: { isPending: false, isError: false, mutate: vi.fn(), data: null },
    thing: { isPending: false, isError: false, mutate: vi.fn(), data: null },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useMatchesMock.mockReturnValue(baseMock);
  });

  it("lists the matches with name, dates and player range", () => {
    renderWithI18n(<Matches />);
    expect(screen.getByText("Friday night games")).toBeTruthy();
    expect(screen.getByText(/3–5/)).toBeTruthy();
    expect(screen.getByText("Matches")).toBeTruthy();
  });

  it("opens the wizard when the create FAB is pressed", () => {
    renderWithI18n(<Matches />);
    fireEvent.click(screen.getByLabelText(/create a match/i));
    expect(screen.getByText("New match")).toBeTruthy();
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
  });

  it("shows the empty state when there are no matches", () => {
    useMatchesMock.mockReturnValueOnce({
      list: { isPending: false, isError: false, data: [] },
      create: { isError: false, mutateAsync: vi.fn(), isPending: false },
      search: { isPending: false, isError: false, mutate: vi.fn(), data: null },
      thing: { isPending: false, isError: false, mutate: vi.fn(), data: null },
    });
    renderWithI18n(<Matches />);
    expect(screen.getByText(/No matches yet/)).toBeTruthy();
  });
});
