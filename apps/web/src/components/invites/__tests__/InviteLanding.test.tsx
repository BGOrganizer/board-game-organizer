import type { InviteReviewResponse } from "@board-game-organizer/schemas";
import { CommunityApiError } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { InviteLanding } from "../../../../../api/src/app/invite/[token]/InviteLanding";
import InvitePage from "../../../../../api/src/app/invite/[token]/page";

const state = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: "invitee", getToken: vi.fn() },
  review: {
    data: undefined as InviteReviewResponse | undefined,
    isError: false,
    error: null as unknown,
    isFetching: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  },
  claim: {
    mutateAsync: vi.fn(),
    isSuccess: false,
    isPending: false,
    isError: false,
    data: undefined as
      | {
          success: true;
          inviter: null;
          table?: {
            groupId: string;
            eventId: string;
            tableId: string;
            position: "SEATED" | "WAITING";
          };
        }
      | undefined,
  },
  hook: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => state.auth,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(typeof window === "undefined" ? "" : window.location.search),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<object>()),
  useInviteClaim: (...args: unknown[]) => {
    state.hook(...args);
    return { review: state.review, claim: state.claim };
  },
}));
vi.mock("../../../../../api/src/app/invite/[token]/InviteProviders", () => ({
  InviteProviders: ({ children }: { children: ReactNode }) => children,
}));
const token = "table-invite-token";
const intent = `bgo:invite-claim:${token}`;
function tableReview(): Extract<InviteReviewResponse, { kind: "TABLE" }> {
  return {
    kind: "TABLE",
    expiresAt: "2030-06-07T12:00:00.000Z",
    inviter: { id: "owner", name: "Owner", username: "owner", avatarUrl: null },
    group: { id: "group", name: "Private group" },
    event: {
      id: eventId,
      name: plannedEvent.name,
      version: 7,
      timeZone: plannedEvent.timeZone,
      startTime: plannedEvent.startTime,
      dates: plannedEvent.dates,
      locations: plannedEvent.locations,
      planningMode: "ASSISTED",
      playerPreference: "MORE_PLAYERS",
    },
    table: {
      id: tableId,
      name: plannedTable.name,
      games: plannedTable.games,
      gamesDetail: plannedTable.gamesDetail,
      minPlayers: 2,
      maxPlayers: 4,
      rankingEnabled: true,
    },
    requiresAvailability: true,
    ownAvailability: null,
    ownRegistration: null,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state.auth, { isLoaded: true, isSignedIn: true, userId: "invitee" });
  Object.assign(state.review, {
    data: undefined,
    isError: false,
    error: null,
    isFetching: false,
    isPlaceholderData: false,
  });
  Object.assign(state.claim, {
    isSuccess: false,
    isPending: false,
    isError: false,
    data: undefined,
  });
  state.claim.mutateAsync.mockReset().mockResolvedValue({ success: true, inviter: null });
  sessionStorage.clear();
  window.history.replaceState(null, "", `/invite/${token}`);
});
it.each([false, true])(
  "never reads private details until the authentication session is ready (loaded=%s)",
  (loaded) => {
    Object.assign(state.auth, { isLoaded: loaded, isSignedIn: false, userId: null });
    renderWithI18n(<InviteLanding token={token} />);
    expect(state.hook).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }), token);
    expect(state.claim.mutateAsync).not.toHaveBeenCalled();
    expect(
      loaded
        ? screen.getByRole("button", { name: "Sign in to claim" })
        : screen.getByRole("status", { name: "Loading your session…" }),
    ).toBeTruthy();
  },
);
it("loads the review before an authenticated signup callback can claim anything", async () => {
  sessionStorage.setItem(intent, String(Date.now()));
  window.history.replaceState(null, "", `/invite/${token}?claim=1`);
  const view = renderWithI18n(<InviteLanding token={token} />);
  expect(screen.getByRole("status", { name: "Loading invitation…" })).toBeTruthy();
  expect(state.claim.mutateAsync).not.toHaveBeenCalled();
  state.review.data = tableReview();
  view.rerender(<InviteLanding token={token} />);
  expect(screen.getByText("Review table invitation")).toBeTruthy();
  expect(state.claim.mutateAsync).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() =>
    expect(state.claim.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ consent: true }),
    ),
  );
});
it("resumes the legacy explicit friend intent only after a fresh friend review", async () => {
  sessionStorage.setItem(intent, String(Date.now()));
  window.history.replaceState(null, "", `/invite/${token}?claim=1`);
  const view = renderWithI18n(<InviteLanding token={token} />);
  state.review.data = {
    kind: "FRIEND",
    expiresAt: "2030-06-07T12:00:00.000Z",
    inviter: tableReview().inviter,
  };
  view.rerender(<InviteLanding token={token} />);
  await screen.findByText("Invite claimed — you are now friends with the inviter!");
  expect(state.claim.mutateAsync).toHaveBeenCalledExactlyOnceWith({});
  expect(sessionStorage.getItem(intent)).toBeNull();
});
it("keeps an authenticated direct friend visit explicit", () => {
  state.review.data = {
    kind: "FRIEND",
    expiresAt: "2030-06-07T12:00:00.000Z",
    inviter: tableReview().inviter,
  };
  renderWithI18n(<InviteLanding token={token} />);
  expect(screen.getByRole("button", { name: "Claim invite" })).toBeTruthy();
  expect(state.claim.mutateAsync).not.toHaveBeenCalled();
});
it.each([401, 403, 404, 409, 410])(
  "hides retained private context when review returns %i",
  (status) => {
    Object.assign(state.review, {
      data: tableReview(),
      isError: true,
      error: new CommunityApiError(status, "Unavailable"),
    });
    renderWithI18n(<InviteLanding token={token} />);
    expect(screen.getByRole("alert").textContent).toBe("Invitation unavailable");
    expect(screen.queryByText("Private group")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.review.refetch).toHaveBeenCalledOnce();
  },
);
it.each([false, true])("keeps a network failure observable with cached details=%s", (cached) => {
  Object.assign(state.review, {
    data: cached ? tableReview() : undefined,
    isError: true,
    error: new Error("Offline"),
  });
  renderWithI18n(<InviteLanding token={token} />);
  expect(screen.getByRole("alert").textContent).toContain("Could not load this invitation.");
  if (cached)
    expect(screen.getByRole("button", { name: "Accept invitation" }).hasAttribute("disabled")).toBe(
      true,
    );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(state.review.refetch).toHaveBeenCalledOnce();
});
it.each(["isFetching", "isPlaceholderData"] as const)(
  "preserves cached review but disables acceptance during %s",
  (field) => {
    Object.assign(state.review, { data: tableReview(), [field]: true });
    renderWithI18n(<InviteLanding token={token} />);
    expect(screen.queryByRole("status", { name: "Loading invitation…" })).toBeNull();
    expect(screen.getByRole("button", { name: "Accept invitation" }).hasAttribute("disabled")).toBe(
      true,
    );
  },
);
it.each([undefined, "SEATED", "WAITING"] as const)(
  "keeps successful %s receipt visible when its consumed token becomes unavailable",
  (position) => {
    Object.assign(state.claim, {
      isSuccess: true,
      data: {
        success: true,
        inviter: null,
        ...(position ? { table: { groupId: "group", eventId, tableId, position } } : {}),
      },
    });
    Object.assign(state.review, { isError: true, error: new CommunityApiError(409, "Consumed") });
    renderWithI18n(<InviteLanding token={token} />);
    expect(screen.getByRole("status").textContent).toBe(
      position
        ? "You are now connected with the inviter and have joined the group."
        : "Invite claimed — you are now friends with the inviter!",
    );
    if (position)
      expect(
        screen.getByText(
          position === "WAITING"
            ? "You joined the waiting list."
            : "You have a place at the table.",
        ),
      ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  },
);
it("resets stale acceptance drafts after a changed event version", () => {
  const value = tableReview();
  value.table.games = [...value.table.games, { ...value.table.games[0], gameId: 2 }];
  state.review.data = value;
  const view = renderWithI18n(<InviteLanding token={token} />);
  const yes = screen.getAllByRole("button", { name: /: Yes$/ })[0];
  fireEvent.click(yes);
  expect(yes.getAttribute("aria-pressed")).toBe("true");
  state.review.data = { ...value, event: { ...value.event, version: 8 } };
  view.rerender(<InviteLanding token={token} />);
  expect(screen.getAllByRole("button", { name: /: Yes$/ })[0].getAttribute("aria-pressed")).toBe(
    "false",
  );
});
it("server page awaits params and keys each invite workflow", async () => {
  const page = await InvitePage({ params: Promise.resolve({ token }) });
  const child = page.props.children.props.children;
  expect(child.type).toBe(InviteLanding);
  expect(child.key).toBe(token);
  expect(child.props.token).toBe(token);
});
it("retains a friend's explicit claim action alongside an observable transient read failure", async () => {
  state.review.data = {
    kind: "FRIEND",
    expiresAt: "2030-06-07T12:00:00.000Z",
    inviter: tableReview().inviter,
  };
  state.review.isError = true;
  state.review.error = new Error("Offline");
  renderWithI18n(<InviteLanding token={token} />);
  expect(screen.getByRole("alert").textContent).toContain("Could not load this invitation.");
  fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
  await waitFor(() => expect(state.claim.mutateAsync).toHaveBeenCalledExactlyOnceWith({}));
});

it("renders the server shell without reading browser state or starting a private request", () => {
  Object.assign(state.auth, { isLoaded: false, isSignedIn: false, userId: null });
  const browser = window;
  vi.stubGlobal("window", undefined);
  try {
    const html = renderToString(
      <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>
        <InviteLanding token={token} />
      </I18nProvider>,
    );
    expect(html).toContain("Loading your session");
    expect(state.hook).toHaveBeenCalledWith(
      expect.objectContaining({ apiUrl: "", enabled: false }),
      token,
    );
    expect(state.claim.mutateAsync).not.toHaveBeenCalled();
  } finally {
    vi.stubGlobal("window", browser);
  }
});
it("lets an unsuccessful final acceptance refresh the authoritative table review", () => {
  state.review.data = tableReview();
  state.claim.isError = true;
  renderWithI18n(<InviteLanding token={token} />);
  expect(screen.getByRole("alert").textContent).toContain("Could not accept this invitation");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(state.review.refetch).toHaveBeenCalledOnce();
});
it("reviews an existing registration without losing its version or requiring replacement choices", () => {
  const review = tableReview();
  review.ownRegistration = {
    id: tableId,
    status: "ACCEPTED",
    version: 3,
    kind: "SELF",
    gameVotes: { "1": "YES" },
  };
  state.review.data = review;
  renderWithI18n(<InviteLanding token={token} />);
  expect(screen.getByText(/Your place and choices will be kept/)).toBeTruthy();
  expect(state.claim.mutateAsync).not.toHaveBeenCalled();
});
