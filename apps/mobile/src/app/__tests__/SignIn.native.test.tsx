import { act, render, screen } from "@testing-library/react-native";
import { createContext, useContext } from "react";
import { Text, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import SignInScreen from "../sign-in";

type Session = {
  authLoaded: boolean;
  signedIn: boolean | undefined;
  userLoaded: boolean;
  user: { unsafeMetadata: unknown } | null;
  inviteToken?: string | string[];
};
const anonymous: Session = { authLoaded: true, signedIn: false, userLoaded: false, user: null };
const SessionContext = createContext(anonymous);
type AuthViewProps = { mode: string; isDismissible: boolean; onHostBack: () => void };
type Destination = string | { pathname: string; params: { inviteToken?: string } };
const sdk = vi.hoisted(() => ({
  back: vi.fn(),
  authOptions: vi.fn(),
  redirect: vi.fn(),
  nativeAuth: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: (options?: { treatPendingAsSignedOut?: boolean }) => {
    sdk.authOptions(options);
    const session = useContext(SessionContext);
    return { isLoaded: session.authLoaded, isSignedIn: session.signedIn };
  },
  useUser: () => {
    const session = useContext(SessionContext);
    return { isLoaded: session.userLoaded, user: session.user };
  },
}));
// The actual Clerk login surface requires its native host and provider. This
// adapter records only its public configuration/events; no BGO UI is replaced.
vi.mock("@clerk/expo/native", () => ({
  AuthView: (props: AuthViewProps) => {
    sdk.nativeAuth(props);
    return <View testID="sdk-native-auth-view" />;
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: sdk.back }),
  useLocalSearchParams: () => ({ inviteToken: useContext(SessionContext).inviteToken }),
  Redirect: ({ href }: { href: Destination }) => {
    sdk.redirect(href);
    return (
      <Text testID="sdk-redirect-target">
        {typeof href === "string" ? href : JSON.stringify(href)}
      </Text>
    );
  },
}));
const validToken = "abcdefghijklmnopqrstuv";
const complete: Session = {
  authLoaded: true,
  signedIn: true,
  userLoaded: true,
  user: { unsafeMetadata: { mobileNumber: "fixture contact value" } },
};
function Fixture({ session = anonymous }: { session?: Session } = {}) {
  return (
    <NativeTestProviders>
      <SessionContext value={session}>
        <SignInScreen />
      </SessionContext>
    </NativeTestProviders>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Sign-in route decisions cannot call API or Clerk HTTP");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it.each([anonymous, { ...anonymous, authLoaded: false, signedIn: undefined }])(
  "delegates anonymous/unresolved authentication to the native SDK without premature application navigation",
  async (session) => {
    await render(<Fixture session={session} />);
    expect(screen.getByTestId("sdk-native-auth-view")).toBeOnTheScreen();
    expect(sdk.nativeAuth).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: "signInOrUp",
        isDismissible: false,
        onHostBack: expect.any(Function),
      }),
    );
    expect(sdk.redirect).not.toHaveBeenCalled();
    expect(sdk.authOptions).toHaveBeenCalledWith({ treatPendingAsSignedOut: false });
  },
);

it("forwards the native AuthView host-back event to the actual router boundary exactly once", async () => {
  await render(<Fixture />);
  const props = sdk.nativeAuth.mock.calls.at(-1)?.[0] as AuthViewProps | undefined;
  if (!props) throw new Error("Expected the configured native authentication surface");
  await act(() => props.onHostBack());
  expect(sdk.back).toHaveBeenCalledExactlyOnceWith();
  expect(sdk.redirect).not.toHaveBeenCalled();
});

it("waits for signed-in user metadata without showing login again or losing the invite continuation", async () => {
  await render(<Fixture session={{ ...complete, userLoaded: false, inviteToken: validToken }} />);
  expect(screen.queryByTestId("sdk-native-auth-view")).toBeNull();
  expect(screen.queryByTestId("sdk-redirect-target")).toBeNull();
  expect(sdk.nativeAuth).not.toHaveBeenCalled();
  expect(sdk.back).not.toHaveBeenCalled();
});

it("continues a completed signup directly to the validated invitation without claiming it", async () => {
  await render(<Fixture session={{ ...complete, inviteToken: validToken }} />);
  expect(sdk.redirect).toHaveBeenLastCalledWith(`/invite/${validToken}`);
  expect(screen.queryByTestId("sdk-native-auth-view")).toBeNull();
});

it.each([
  { inviteToken: undefined },
  { inviteToken: [validToken] },
  { inviteToken: "https://untrusted.invalid/invite/elsewhere" },
  { inviteToken: "short" },
])(
  "rejects noncanonical invite continuation $inviteToken and uses ordinary application entry",
  async ({ inviteToken }) => {
    await render(<Fixture session={{ ...complete, inviteToken }} />);
    expect(sdk.redirect).toHaveBeenLastCalledWith("/tables");
    expect(sdk.back).not.toHaveBeenCalled();
  },
);

it.each([
  { user: null, inviteToken: validToken, params: { inviteToken: validToken } },
  { user: { unsafeMetadata: {} }, inviteToken: validToken, params: { inviteToken: validToken } },
  { user: { unsafeMetadata: { mobileNumber: "   " } }, inviteToken: [validToken], params: {} },
])(
  "keeps missing required signup metadata in onboarding with only the authorized continuation $params",
  async ({ user, inviteToken, params }) => {
    await render(<Fixture session={{ ...complete, user, inviteToken }} />);
    expect(sdk.redirect).toHaveBeenLastCalledWith({ pathname: "/mobile-number", params });
    expect(screen.queryByTestId("sdk-native-auth-view")).toBeNull();
  },
);

it("reconciles SDK authentication and metadata transitions declaratively while preserving one validated invite", async () => {
  const view = await render(<Fixture session={{ ...anonymous, inviteToken: validToken }} />);
  expect(screen.getByTestId("sdk-native-auth-view")).toBeOnTheScreen();
  await view.rerender(
    <Fixture session={{ ...complete, userLoaded: false, inviteToken: validToken }} />,
  );
  expect(screen.queryByTestId("sdk-native-auth-view")).toBeNull();
  expect(sdk.redirect).not.toHaveBeenCalled();
  await view.rerender(<Fixture session={{ ...complete, user: null, inviteToken: validToken }} />);
  expect(sdk.redirect).toHaveBeenLastCalledWith({
    pathname: "/mobile-number",
    params: { inviteToken: validToken },
  });
  await view.rerender(<Fixture session={{ ...complete, inviteToken: validToken }} />);
  expect(sdk.redirect).toHaveBeenLastCalledWith(`/invite/${validToken}`);
  expect(sdk.back).not.toHaveBeenCalled();
});
