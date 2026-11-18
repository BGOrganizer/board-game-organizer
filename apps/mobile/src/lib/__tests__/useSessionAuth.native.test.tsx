import { useAuth } from "@clerk/expo";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Text } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";
import { useSessionAuth } from "../useSessionAuth";

type Auth = {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null;
  sessionId: string | null;
};
const initialToken = async () => "initial";
const authenticated: Auth = {
  getToken: initialToken,
  isLoaded: true,
  isSignedIn: true,
  userId: "user-1",
  sessionId: "session-1",
};
const ClerkBoundaryContext = createContext(authenticated);
vi.mock("@clerk/expo", () => ({
  useAuth: vi.fn(() => useContext(ClerkBoundaryContext)),
}));

// Isolated actual React hook/RN consumer units. Only the Clerk SDK auth
// boundary is controlled; no claim of real Clerk pending-session acceptance,
// navigation performance, private-query ownership or persisted cache safety.
function Fixture({ auth, children }: { auth: Auth; children: ReactNode }) {
  return <ClerkBoundaryContext value={auth}>{children}</ClerkBoundaryContext>;
}
beforeEach(() => {
  vi.mocked(useAuth).mockClear();
});

it("keeps query-gating effects stable across Clerk token refreshes while requests use the latest committed callback", async () => {
  let requestToken: (() => Promise<string | null>) | undefined;
  let effectLoads = 0;
  function Consumer() {
    const { getToken } = useSessionAuth();
    const [keyToken, setKeyToken] = useState<string | null>(null);
    requestToken = getToken;
    useEffect(() => {
      effectLoads++;
      void getToken().then(setKeyToken);
    }, [getToken]);
    return <Text>{`Cached token: ${keyToken ?? "none"}`}</Text>;
  }
  const first = vi.fn(async () => "initial");
  const view = await render(
    <Fixture auth={{ ...authenticated, getToken: first }}>
      <Consumer />
    </Fixture>,
  );
  await waitFor(() => expect(screen.getByText("Cached token: initial")).toBeOnTheScreen());
  expect(effectLoads).toBe(1);
  const stable = requestToken;
  const refreshed = vi.fn(async () => "renewed");
  await view.rerender(
    <Fixture auth={{ ...authenticated, getToken: refreshed }}>
      <Consumer />
    </Fixture>,
  );
  expect(requestToken).toBe(stable);
  expect(screen.getByText("Cached token: initial")).toBeOnTheScreen();
  expect(effectLoads).toBe(1);
  expect(refreshed).not.toHaveBeenCalled();
  expect(await requestToken?.()).toBe("renewed");
  expect(refreshed).toHaveBeenCalledOnce();
  const replacement = vi.fn(async () => "new session");
  await view.rerender(
    <Fixture auth={{ ...authenticated, sessionId: "session-2", getToken: replacement }}>
      <Consumer />
    </Fixture>,
  );
  await waitFor(() => expect(screen.getByText("Cached token: new session")).toBeOnTheScreen());
  expect(requestToken).not.toBe(stable);
  expect(effectLoads).toBe(2);
  expect(replacement).toHaveBeenCalledOnce();
  await view.unmount();
});

// Mutable boundary props belong to the wrapper's controlled external SDK,
// never to the hook under test. Rerender commits its real layout effect first.
async function sessionHook(initial: Auth = authenticated) {
  let auth = initial;
  const mounted = await renderHook(() => useSessionAuth(), {
    wrapper: ({ children }: { children: ReactNode }) => <Fixture auth={auth}>{children}</Fixture>,
  });
  return {
    ...mounted,
    update: async (next: Auth) => {
      auth = next;
      await mounted.rerender(undefined);
    },
  };
}

it.each([
  { userId: "user-2", sessionId: "session-1" },
  { userId: "user-1", sessionId: "session-2" },
  { userId: "user-2", sessionId: "session-2" },
])(
  "rekeys its callback for a changed stable session identity %j without fetching by itself",
  async (identity) => {
    const token = vi.fn(async () => "identity-token");
    const f = await sessionHook({ ...authenticated, getToken: token });
    const previous = f.result.current.getToken;
    expect(token).not.toHaveBeenCalled();
    await f.update({ ...authenticated, ...identity, getToken: token });
    expect(f.result.current.getToken).not.toBe(previous);
    expect(f.result.current).toMatchObject(identity);
    expect(token).not.toHaveBeenCalled();
    expect(await f.result.current.getToken()).toBe("identity-token");
  },
);

it.each([
  { userId: null, sessionId: null },
  { userId: null, sessionId: "session-1" },
  { userId: "user-1", sessionId: null },
  { userId: "", sessionId: "session-1" },
  { userId: "user-1", sessionId: "" },
])("does not request a provider token without both stable identities %j", async (identity) => {
  const token = vi.fn(async () => "must-not-leak");
  const f = await sessionHook({
    ...authenticated,
    ...identity,
    getToken: token,
  });
  await expect(f.result.current.getToken()).resolves.toBeNull();
  expect(token).not.toHaveBeenCalled();
});

it.each([
  { isLoaded: false, isSignedIn: undefined },
  { isLoaded: true, isSignedIn: false },
  { isLoaded: true, isSignedIn: true },
])(
  "forwards the actual provider auth flags without overriding Clerk default pending policy %j",
  async (flags) => {
    const token = vi.fn(async () => "not-requested");
    const f = await sessionHook({
      ...authenticated,
      ...flags,
      getToken: token,
    });
    expect(f.result.current).toMatchObject(flags);
    expect(vi.mocked(useAuth).mock.calls.every((args) => args.length === 0)).toBe(true);
    expect(token).not.toHaveBeenCalled();
  },
);

it("forwards provider null tokens and errors without manufacturing authorization or swallowing failures", async () => {
  const token = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);
  const f = await sessionHook({ ...authenticated, getToken: token });
  await expect(f.result.current.getToken()).resolves.toBeNull();
  const failure = new Error("Clerk token unavailable");
  token.mockRejectedValueOnce(failure);
  await expect(f.result.current.getToken()).rejects.toBe(failure);
  expect(token).toHaveBeenCalledTimes(2);
});

it("switches to the current signed-out getter without invoking either the old or current provider token", async () => {
  const old = vi.fn(async () => "old-owner-token");
  const next = vi.fn(async () => "signed-out-token");
  const f = await sessionHook({ ...authenticated, getToken: old });
  const previous = f.result.current.getToken;
  await f.update({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    sessionId: null,
    getToken: next,
  });
  expect(f.result.current.getToken).not.toBe(previous);
  await expect(f.result.current.getToken()).resolves.toBeNull();
  expect(f.result.current).toMatchObject({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    sessionId: null,
  });
  expect(old).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

it("retains callback identity while applying the latest SDK callback even when no token was requested before refresh", async () => {
  const old = vi.fn(async () => "retired");
  const current = vi.fn(async () => "current");
  const f = await sessionHook({ ...authenticated, getToken: old });
  const stable = f.result.current.getToken;
  await f.update({ ...authenticated, getToken: current });
  expect(f.result.current.getToken).toBe(stable);
  await act(async () => {
    expect(await stable()).toBe("current");
  });
  expect(old).not.toHaveBeenCalled();
  expect(current).toHaveBeenCalledOnce();
});
