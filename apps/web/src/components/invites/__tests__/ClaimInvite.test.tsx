import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { StrictMode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import ClaimInvite from "../../../../../api/src/app/invite/[token]/claim";

const state = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: false,
  claimInvite: vi.fn(),
  signInOptions: {} as Record<string, unknown>,
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => state,
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  SignInButton: ({ children, ...options }: { children: ReactNode }) => {
    state.signInOptions = options;
    return children;
  },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const token = "invite-token-1234567890";
const key = `bgo:invite-claim:${token}`;
const callback = `/invite/${token}?claim=1`;
beforeEach(() => {
  vi.restoreAllMocks();
  state.isLoaded = true;
  state.isSignedIn = false;
  state.claimInvite.mockReset().mockResolvedValue({ success: true, inviter: null });
  sessionStorage.clear();
  window.history.replaceState(null, "", `/invite/${token}`);
});

it("returns both authentication paths to the invite and remembers an explicit claim", () => {
  renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(state.signInOptions).toMatchObject({
    forceRedirectUrl: callback,
    signUpForceRedirectUrl: callback,
  });
  expect(sessionStorage.getItem(key)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign in to claim" }));
  expect(Number(sessionStorage.getItem(key))).toBeGreaterThan(Date.now() - 1000);
  expect(state.claimInvite).not.toHaveBeenCalled();
});

it.each(["sign-in", "sign-up"])(
  "resumes an explicit invite claim after %s and a full page remount, once in StrictMode",
  async (flow) => {
    const initial = renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in to claim" }));
    initial.unmount();
    state.isSignedIn = true;
    window.history.replaceState(
      null,
      "",
      String(
        state.signInOptions[flow === "sign-up" ? "signUpForceRedirectUrl" : "forceRedirectUrl"],
      ),
    );
    renderWithI18n(
      <StrictMode>
        <ClaimInvite token={token} onClaim={state.claimInvite} />
      </StrictMode>,
    );
    await waitFor(() => expect(state.claimInvite).toHaveBeenCalledOnce());
    expect(state.claimInvite).toHaveBeenCalledWith();
    expect(sessionStorage.getItem(key)).toBeNull();
    await screen.findByText("Invite claimed — you are now friends with the inviter!");
  },
);

it("encodes the token inside the fixed invite callback path", () => {
  const value = "token?claim=0&redirect_url=https://other.test";
  renderWithI18n(<ClaimInvite token={value} onClaim={state.claimInvite} />);
  const url = new URL(String(state.signInOptions.signUpForceRedirectUrl), window.location.origin);
  expect(url.origin).toBe(window.location.origin);
  expect(url.pathname).toBe(`/invite/${encodeURIComponent(value)}`);
  expect([...url.searchParams]).toEqual([["claim", "1"]]);
});

it("resumes when client navigation adds the callback after the session is already authenticated", async () => {
  const view = renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  fireEvent.click(screen.getByRole("button", { name: "Sign in to claim" }));
  state.isSignedIn = true;
  view.rerender(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(state.claimInvite).not.toHaveBeenCalled();
  window.history.replaceState(null, "", callback);
  view.rerender(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  await screen.findByRole("status");
  expect(state.claimInvite).toHaveBeenCalledOnce();
});

it("does not claim an invite just because an authenticated user opens its URL", () => {
  state.isSignedIn = true;
  window.history.replaceState(null, "", callback);
  renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(state.claimInvite).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Claim invite" })).toBeTruthy();
});

it("waits for the loaded, authenticated session before resuming", async () => {
  sessionStorage.setItem(key, String(Date.now()));
  window.history.replaceState(null, "", callback);
  state.isLoaded = false;
  const view = renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(screen.getByRole("status", { name: "Loading your session…" })).toBeTruthy();
  expect(state.claimInvite).not.toHaveBeenCalled();
  state.isLoaded = true;
  view.rerender(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(screen.getByRole("button", { name: "Sign in to claim" })).toBeTruthy();
  expect(state.claimInvite).not.toHaveBeenCalled();
  state.isSignedIn = true;
  view.rerender(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  await screen.findByRole("status");
  expect(state.claimInvite).toHaveBeenCalledOnce();
});

it("requires the authentication callback even when an earlier intent remains", async () => {
  sessionStorage.setItem(key, String(Date.now()));
  state.isSignedIn = true;
  renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(state.claimInvite).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(key)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
  await screen.findByRole("status");
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(screen.getByRole("button", { name: "Claim invite" }).hasAttribute("disabled")).toBe(true);
});

it.each(["expired", "future", "malformed"])(
  "does not resume a %s intent and leaves the explicit action available",
  (kind) => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const time =
      kind === "expired"
        ? String(now - 30 * 60 * 1000 - 1)
        : kind === "future"
          ? String(now + 1)
          : "invalid";
    sessionStorage.setItem(key, time);
    state.isSignedIn = true;
    window.history.replaceState(null, "", callback);
    renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
    expect(state.claimInvite).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(screen.getByRole("button", { name: "Claim invite" }).hasAttribute("disabled")).toBe(
      false,
    );
  },
);

it("never consumes another invite's pending consent", () => {
  const other = "bgo:invite-claim:different-token";
  sessionStorage.setItem(other, String(Date.now()));
  state.isSignedIn = true;
  window.history.replaceState(null, "", callback);
  renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(state.claimInvite).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(other)).not.toBeNull();
});

it("resets completed claim state when navigating to another invite", async () => {
  state.isSignedIn = true;
  const view = renderWithI18n(
    <ClaimInvite key={token} token={token} onClaim={state.claimInvite} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
  await screen.findByRole("status");
  const other = "another-invite-token";
  view.rerender(<ClaimInvite key={other} token={other} onClaim={state.claimInvite} />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: "Claim invite" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
  await screen.findByRole("status");
  expect(state.claimInvite).toHaveBeenCalledTimes(2);
});

it("coalesces two clicks before the busy state has rendered", async () => {
  let resolve!: (value: { success: boolean; inviter: null }) => void;
  state.claimInvite.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  state.isSignedIn = true;
  renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  const button = screen.getByRole("button", { name: "Claim invite" });
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(state.claimInvite).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Claiming…" }).hasAttribute("disabled")).toBe(true);
  await act(async () => {
    resolve({ success: true, inviter: null });
  });
  await screen.findByRole("status");
  expect(state.claimInvite).toHaveBeenCalledOnce();
});

it("does not replay a completed claim when authentication is refreshed", async () => {
  state.isSignedIn = true;
  window.history.replaceState(null, "", callback);
  const view = renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
  await screen.findByRole("status");
  state.isLoaded = false;
  view.rerender(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  sessionStorage.setItem(key, String(Date.now()));
  state.isLoaded = true;
  view.rerender(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(state.claimInvite).toHaveBeenCalledOnce();
});

it.each([
  ["request failure", "HTTP 503"],
  ["rejected result", "Claim failed."],
  ["unknown failure", "Could not claim."],
])("shows %s and permits an explicit retry", async (kind) => {
  state.isSignedIn = true;
  if (kind === "request failure") state.claimInvite.mockRejectedValueOnce(new Error("HTTP 503"));
  if (kind === "rejected result") state.claimInvite.mockResolvedValueOnce({ success: false });
  if (kind === "unknown failure") state.claimInvite.mockRejectedValueOnce("failed");
  renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Could not claim this invite. Try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
  await screen.findByRole("status");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("consumes a failed automatic claim without retrying it on reload", async () => {
  state.isSignedIn = true;
  state.claimInvite.mockRejectedValueOnce(new Error("HTTP 503"));
  sessionStorage.setItem(key, String(Date.now()));
  window.history.replaceState(null, "", callback);
  const view = renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  await screen.findByRole("alert");
  expect(sessionStorage.getItem(key)).toBeNull();
  view.unmount();
  renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(state.claimInvite).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
  await screen.findByRole("status");
  expect(state.claimInvite).toHaveBeenCalledTimes(2);
});

it("keeps the callback usable when saving intent is blocked", async () => {
  vi.spyOn(Object.getPrototypeOf(window.sessionStorage), "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const view = renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  fireEvent.click(screen.getByRole("button", { name: "Sign in to claim" }));
  expect(state.signInOptions.signUpForceRedirectUrl).toBe(callback);
  view.unmount();
  state.isSignedIn = true;
  window.history.replaceState(null, "", callback);
  renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
  expect(state.claimInvite).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
  await screen.findByRole("status");
});

it.each(["getItem", "removeItem"] as const)(
  "never infers consent when storage %s throws, while preserving manual claims",
  async (method) => {
    sessionStorage.setItem(key, String(Date.now()));
    vi.spyOn(Object.getPrototypeOf(window.sessionStorage), method).mockImplementation(() => {
      throw new Error("blocked");
    });
    state.isSignedIn = true;
    window.history.replaceState(null, "", callback);
    renderWithI18n(<ClaimInvite token={token} onClaim={state.claimInvite} />);
    expect(state.claimInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Claim invite" }));
    await screen.findByRole("status");
    expect(state.claimInvite).toHaveBeenCalledOnce();
  },
);
