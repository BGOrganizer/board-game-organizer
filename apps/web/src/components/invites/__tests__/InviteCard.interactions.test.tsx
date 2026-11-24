import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { InviteCard } from "../InviteCard";
import { InviteCardView } from "../InviteCardView";

const auth = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
  getToken: vi.fn(async () => "fresh-invite-token"),
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ ...auth, userId: "user_owner" }) }));
const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const invite = (index: number) => ({
  token: `synthetic-invite-${index}`,
  link: `https://api.test.invalid/invite/synthetic-invite-${index}`,
  email: null,
  expiresAt: "2030-06-10T10:00:00.000Z",
});
beforeEach(() => {
  auth.isLoaded = auth.isSignedIn = true;
  auth.getToken.mockReset().mockResolvedValue("fresh-invite-token");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

it("creates an authorized link, copies it with temporary feedback and generates a distinct new invitation only on request", async () => {
  let count = 0;
  const requests: { url: URL; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ url: new URL(input), init });
      return Response.json(invite(++count));
    }),
  );
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  renderWithI18n(
    <InviteCard apiUrl="https://api.test.invalid" protectionBypass="invite-preview-bypass" />,
  );
  expect(requests).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
  await screen.findByText(invite(1).link);
  expect(requests).toHaveLength(1);
  expect(requests[0].url.pathname).toBe("/api/invites");
  expect(requests[0].url.searchParams.get("x-vercel-protection-bypass")).toBe(
    "invite-preview-bypass",
  );
  expect(requests[0].init?.method).toBe("POST");
  expect(new Headers(requests[0].init?.headers).get("Authorization")).toBe(
    "Bearer fresh-invite-token",
  );
  expect(JSON.parse(String(requests[0].init?.body))).toEqual({});
  vi.useFakeTimers();
  try {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(invite(1).link);
    expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
  expect(requests).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "New invite" }));
  expect(await screen.findByText(invite(2).link)).toBeTruthy();
  expect(screen.queryByText(invite(1).link)).toBeNull();
  expect(requests).toHaveLength(2);
});

it("leaves the generated link usable when browser clipboard access is denied", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(invite(1))),
  );
  const writeText = vi.fn(async () => {
    throw new Error("Clipboard denied");
  });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  renderWithI18n(<InviteCard apiUrl="https://api.test.invalid" />);
  fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
  await screen.findByText(invite(1).link);
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  expect(screen.getByText(invite(1).link)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Copied!" })).toBeNull();
});

it.each([
  { isLoaded: false, isSignedIn: true },
  { isLoaded: true, isSignedIn: false },
])("hides creation until the session is loaded and signed in: %j", (session) => {
  Object.assign(auth, session);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  renderWithI18n(<InviteCard apiUrl="https://api.test.invalid" />);
  expect(screen.queryByRole("button", { name: "Create invite" })).toBeNull();
  expect(auth.getToken).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("surfaces a failed session-token lookup without issuing an unauthorized invitation request", async () => {
  auth.getToken.mockRejectedValue(new Error("Session unavailable"));
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  renderWithI18n(<InviteCard apiUrl="https://api.test.invalid" />);
  fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Could not create the invite. Try again.",
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("lets a read-only host copy an issued invitation without offering a second creation", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  renderWithI18n(<InviteCardView link={invite(1).link} />);
  expect(screen.getByText(invite(1).link)).toBeVisible();
  expect(screen.queryByRole("button", { name: "New invite" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(await screen.findByRole("button", { name: "Copied!" })).toBeVisible();
  expect(writeText).toHaveBeenCalledExactlyOnceWith(invite(1).link);
});

it("ignores an invite authentication token that arrives after the panel closes", async () => {
  let finish: (token: string) => void = () => {
    throw new Error("Expected pending invite credential");
  };
  auth.getToken.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const view = renderWithI18n(<InviteCard apiUrl="https://api.test.invalid" />);
  expect(auth.getToken).toHaveBeenCalledOnce();
  view.unmount();
  await act(() => finish("old-session-token"));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Create invite" })).toBeNull();
});
