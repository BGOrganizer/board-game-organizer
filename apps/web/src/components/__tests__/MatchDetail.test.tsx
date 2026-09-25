import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchDetail } from "@/components/MatchDetail";
import { renderWithI18n } from "@/test-utils";
import { messages } from "../../../../../messages/en.js";

const useMatchDetailMock = vi.fn();
const authMock = vi.hoisted(() => ({ userId: "user_guest" }));
const routerMock = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const mutate = vi.fn();
const deleteMutate = vi.fn();
const leaveMutate = vi.fn();
const setChoiceMutate = vi.fn();

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
vi.mock("@board-game-organizer/shared", () => ({
  resolveApiUrl: () => "http://localhost:4000",
  useMatchDetail: (options: unknown) => useMatchDetailMock(options),
}));
vi.mock("@/components/MatchWizard", () => ({
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
    setChoice: { mutate: setChoiceMutate, isPending: false },
  };
}

describe("MatchDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.userId = "user_guest";
    useMatchDetailMock.mockReturnValue(result());
  });

  it("shows participant profiles and invitation status icons", () => {
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    expect(screen.getByText("Friday night games")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Players" }));
    expect(screen.getByText("Admin Player")).toBeTruthy();
    expect(screen.getByText("admin@example.com")).toBeTruthy();
    expect(screen.getByText("Guest Player")).toBeTruthy();
    expect(screen.getByText("guest@example.com")).toBeTruthy();
    expect(screen.getByLabelText("Administrator")).toBeTruthy();
    expect(screen.getByLabelText("Pending")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
    expect(screen.getByText("Azul")).toBeTruthy();
  });

  it("shows a game cover and publication year in the games tab", () => {
    useMatchDetailMock.mockReturnValue(
      result({
        ...detail,
        games: [
          {
            id: 1,
            name: "Azul",
            yearPublished: 2017,
            thumbnail: "https://cf.geekdo-images.com/a/thumb.jpg",
          },
        ],
      }),
    );
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
    expect(screen.getByText("2017")).toBeTruthy();
    expect(
      document.querySelector('img[src="https://cf.geekdo-images.com/a/thumb.jpg"]'),
    ).toBeTruthy();
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
    expect(dateAction.querySelector("svg.lucide-circle-question-mark")).toBeTruthy();
    fireEvent.click(dateAction);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Yes" }));
    expect(setChoiceMutate).toHaveBeenCalledWith({
      kind: "dates",
      itemId: detail.match.dates[0],
      choice: "YES",
    });
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
    const gameAction = screen.getByRole("button", { name: /Choose game/ });
    expect(gameAction.className).toContain("button--outline");
    expect(gameAction.querySelector("svg.lucide-circle-question-mark")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
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
    expect(warningAction.querySelector("svg.lucide-circle-alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
    expect(
      screen
        .getByRole("button", { name: "Choose game: Not known" })
        .querySelector("svg.lucide-circle-question-mark"),
    ).toBeTruthy();
  });

  it("confirms match deletion for admins", () => {
    authMock.userId = "user_admin";
    renderWithI18n(<MatchDetail matchId={invitation.matchId} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete match" }));
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
    fireEvent.click(screen.getByRole("tab", { name: "Games" }));
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
