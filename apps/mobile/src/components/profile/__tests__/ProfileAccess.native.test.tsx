import { URL } from "node:url";
import type { ProfileView } from "@board-game-organizer/schemas";
import {
  bggAccountQuery,
  profileActivitiesQuery,
  profileViewQuery,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { createContext, useContext } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProfileScreen from "@/app/profile";
import { NativeTestProviders } from "@/test/NativeTestProviders";

const API = "https://profile-access-native.test";
type Session = {
  authLoaded: boolean;
  signedIn: boolean | undefined;
  userLoaded: boolean;
  owner: string;
  apiUrl: string;
  user: { id: string; unsafeMetadata: unknown; createdAt: Date } | null;
};
const ownerUser = {
  id: "owner",
  unsafeMetadata: { mobileNumber: "fixture contact value" },
  createdAt: new Date("2020-02-03T12:00:00.000Z"),
};
const complete: Session = {
  authLoaded: true,
  signedIn: true,
  userLoaded: true,
  owner: "owner",
  apiUrl: API,
  user: ownerUser,
};
const SessionContext = createContext(complete);
const sdk = vi.hoisted(() => ({
  authOptions: vi.fn(),
  token: vi.fn(),
  signOut: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  redirect: vi.fn(),
}));
function options(session: Session) {
  return {
    apiUrl: session.apiUrl,
    userId: session.owner,
    enabled: true,
    getToken: async () => sdk.token(session.owner),
  };
}
vi.mock("@clerk/expo", () => ({
  useAuth: (config?: { treatPendingAsSignedOut?: boolean }) => {
    sdk.authOptions(config);
    const session = useContext(SessionContext);
    return {
      isLoaded: session.authLoaded,
      isSignedIn: session.signedIn,
      userId: session.signedIn ? session.owner : null,
      sessionId: session.signedIn ? `session-${session.owner}` : null,
      signOut: sdk.signOut,
      getToken: options(session).getToken,
    };
  },
  useUser: () => {
    const session = useContext(SessionContext);
    return { isLoaded: session.userLoaded, user: session.user };
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: sdk.push, replace: sdk.replace }),
  Redirect: ({ href }: { href: string }) => {
    sdk.redirect(href);
    return <Text testID="sdk-redirect-target">{href}</Text>;
  },
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { apiUrl: "https://profile-access-native.test", sentryEnvironment: "development" },
    },
  },
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getPermissionsAsync: vi.fn(async () => ({ status: "denied", canAskAgain: false })),
}));

let client: QueryClient;
let originalStore: ReturnType<typeof useAppStore.getState>;
let blockProfileRead: boolean;
let signal: AbortSignal | undefined;
const reads: string[] = [];
const writes: string[] = [];
function profile(session: Session): ProfileView {
  return {
    id: session.owner,
    name: `Profile ${session.owner} on ${new URL(session.apiUrl).hostname}`,
    username: session.owner,
    avatarUrl: null,
    social: { friends: 1, followers: 2, following: 3 },
    player: { gamesPlayed: 4, gamesWon: 1, winRate: 25 },
  };
}
function seed(session: Session, includeProfile = true) {
  const o = options(session);
  if (includeProfile)
    client.setQueryData(profileViewQuery(o, session.owner).queryKey, profile(session));
  client.setQueryData(bggAccountQuery(o).queryKey, { active: null, pending: null });
  client.setQueryData(profileActivitiesQuery(o, session.owner, undefined, 5).queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [""],
  });
}
function Fixture({ session = complete }: { session?: Session } = {}) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <SessionContext value={session}>
          <ProfileScreen />
        </SessionContext>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sdk.token.mockImplementation(async (owner: string) => `fixture-${owner}`);
  sdk.signOut.mockResolvedValue(undefined);
  originalStore = useAppStore.getState();
  useAppStore.getState().clearProfileViews();
  blockProfileRead = false;
  signal = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  seed(complete);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        writes.push(`${method} ${url.pathname}`);
        throw new Error("An access gate cannot grant write consent");
      }
      reads.push(`${url.origin}${url.pathname}`);
      if (!blockProfileRead || url.origin !== API || url.pathname !== "/api/profiles/owner")
        throw new Error("Authorized profile data must use the owned canonical cache");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-owner");
      signal = init?.signal ?? undefined;
      if (!signal) throw new Error("Expected actual Query cancellation to reach the HTTP boundary");
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      });
    }),
  );
});
afterEach(() => {
  expect(writes).toEqual([]);
  expect(sdk.signOut).not.toHaveBeenCalled();
  client.clear();
  useAppStore.setState(originalStore, true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { ...complete, authLoaded: false, signedIn: undefined, userLoaded: false },
  { ...complete, userLoaded: false },
])(
  "keeps private Profile children unmounted until actual Clerk auth/user readiness is available",
  async (session) => {
    await render(<Fixture session={session} />);
    expect(screen.queryByText("@owner")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out of your account" })).toBeNull();
    expect(screen.queryByTestId("sdk-redirect-target")).toBeNull();
    expect(sdk.authOptions).toHaveBeenCalledWith({ treatPendingAsSignedOut: false });
    expect(reads).toEqual([]);
  },
);

it("redirects a signed-out session without waiting for a private user record or mounting its Profile", async () => {
  await render(
    <Fixture session={{ ...complete, signedIn: false, userLoaded: false, user: null }} />,
  );
  expect(sdk.redirect).toHaveBeenLastCalledWith("/");
  expect(screen.queryByText("@owner")).toBeNull();
  expect(reads).toEqual([]);
});

it.each([
  { user: null },
  {
    user: {
      ...ownerUser,
      unsafeMetadata: {},
    },
  },
  {
    user: {
      ...ownerUser,
      unsafeMetadata: { mobileNumber: "  " },
    },
  },
])(
  "sends missing required metadata to onboarding before exposing the actual private child",
  async ({ user }) => {
    await render(<Fixture session={{ ...complete, user }} />);
    expect(sdk.redirect).toHaveBeenLastCalledWith("/mobile-number");
    expect(screen.queryByText("@owner")).toBeNull();
    expect(reads).toEqual([]);
  },
);

it("renders the real cached Profile, identity, statistics and logout when the nonempty metadata contract is satisfied", async () => {
  await render(<Fixture />);
  expect(await screen.findByText("@owner")).toBeVisible();
  expect(screen.getByText(profile(complete).name)).toBeVisible();
  expect(screen.getByRole("button", { name: "Sign out of your account" })).toBeEnabled();
  expect(screen.getByText("Friends")).toBeVisible();
  expect(screen.getByText("No activities yet")).toBeVisible();
  expect(sdk.redirect).not.toHaveBeenCalled();
  expect(reads).toEqual([]);
});

it("removes the old Profile during account restoration and ignores another API's cached profile", async () => {
  const originalKey = profileViewQuery(options(complete), "owner").queryKey;
  const originalProfile = client.getQueryData(originalKey);
  const view = await render(<Fixture />);
  expect(await screen.findByText("@owner")).toBeVisible();
  const next: Session = {
    ...complete,
    owner: "next-owner",
    user: {
      id: "next-owner",
      unsafeMetadata: { mobileNumber: "fixture next value" },
      createdAt: new Date("2021-03-04T12:00:00.000Z"),
    },
  };
  seed(next);
  await view.rerender(<Fixture session={{ ...next, userLoaded: false }} />);
  expect(screen.queryByText("@owner")).toBeNull();
  expect(screen.queryByText("@next-owner")).toBeNull();
  await view.rerender(<Fixture session={next} />);
  expect(await screen.findByText("@next-owner")).toBeVisible();
  expect(screen.queryByText(profile(complete).name)).toBeNull();
  const otherApi = { ...next, apiUrl: "https://other-profile-access.test" };
  seed(otherApi);
  await view.rerender(<Fixture session={next} />);
  expect(screen.getByText(profile(next).name)).toBeVisible();
  expect(screen.queryByText(profile(otherApi).name)).toBeNull();
  // Purging another account's cache is the upstream persistence provider's job.
  expect(client.getQueryData(originalKey)).toBe(originalProfile);
  expect(reads).toEqual([]);
});

it("unmounts private descendants on sign-out so the actual Query observer aborts its outstanding HTTP read", async () => {
  blockProfileRead = true;
  client.removeQueries({
    queryKey: profileViewQuery(options(complete), "owner").queryKey,
    exact: true,
  });
  const view = await render(<Fixture />);
  await waitFor(() => expect(signal).toBeDefined());
  expect(signal?.aborted).toBe(false);
  await view.rerender(<Fixture session={{ ...complete, signedIn: false, user: null }} />);
  await waitFor(() => expect(signal?.aborted).toBe(true));
  expect(sdk.redirect).toHaveBeenLastCalledWith("/");
  expect(screen.queryByRole("button", { name: "Sign out of your account" })).toBeNull();
  expect(reads).toEqual([`${API}/api/profiles/owner`]);
});
