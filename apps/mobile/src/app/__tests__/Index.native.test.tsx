import { render, screen, userEvent } from "@testing-library/react-native";
import { createContext, type ReactNode, useContext } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import Index from "../index";

type Session = {
  authLoaded: boolean;
  signedIn: boolean | undefined;
  userLoaded: boolean;
  user: {
    id: string;
    unsafeMetadata: unknown;
    firstName?: string;
    username?: string;
  } | null;
};
const anonymous: Session = {
  authLoaded: true,
  signedIn: false,
  userLoaded: true,
  user: null,
};
const Context = createContext(anonymous);
const sdk = vi.hoisted(() => ({
  authOptions: vi.fn(),
  push: vi.fn(),
  nativeUserButton: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: (options?: { treatPendingAsSignedOut?: boolean }) => {
    sdk.authOptions(options);
    const session = useContext(Context);
    return { isLoaded: session.authLoaded, isSignedIn: session.signedIn };
  },
  useUser: () => {
    const session = useContext(Context);
    return { isLoaded: session.userLoaded, user: session.user };
  },
  Show: ({ when, children }: { when: string; children: ReactNode }) => {
    const session = useContext(Context);
    if (when !== "signed-in") throw new Error("Unexpected Clerk display boundary");
    return session.signedIn ? children : null;
  },
}));
vi.mock("@clerk/expo/native", () => ({
  UserButton: () => {
    sdk.nativeUserButton();
    throw new Error("The anonymous landing must not mount the signed-in SDK native control");
  },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: sdk.push }),
  Redirect: ({ href }: { href: string }) => <Text testID="sdk-redirect-target">{href}</Text>,
}));

// Isolated actual Index/Header/LoginFallback + installed RN/HeroUI. Clerk
// session/display and Expo Redirect are controlled SDK contracts, not an
// authenticated Clerk flow, real navigator transition or native performance test.
function Fixture({
  session = anonymous,
  locale = "en",
}: {
  session?: Session;
  locale?: "en" | "it";
}) {
  return (
    <NativeTestProviders locale={locale}>
      <Context value={session}>
        <Index />
      </Context>
    </NativeTestProviders>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("The declarative landing must not fetch private data");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(sdk.nativeUserButton).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("keeps the actual loading state while Clerk authentication has not restored", async () => {
  await render(<Fixture session={{ ...anonymous, authLoaded: false, signedIn: undefined }} />);
  expect(screen.queryByTestId("sdk-redirect-target")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign in / Register" })).toBeNull();
  expect(screen.queryByText("Welcome to Board Game Organizer")).toBeNull();
  expect(sdk.authOptions).toHaveBeenCalledWith({
    treatPendingAsSignedOut: false,
  });
});

it("does not redirect an authenticated session until its actual user metadata has loaded", async () => {
  await render(<Fixture session={{ ...anonymous, signedIn: true, userLoaded: false }} />);
  expect(screen.queryByTestId("sdk-redirect-target")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign in / Register" })).toBeNull();
});

it.each([undefined, {}, { mobileNumber: "  " }, { mobileNumber: 12345 }])(
  "routes incomplete required signup metadata %j only to onboarding",
  async (unsafeMetadata) => {
    await render(
      <Fixture
        session={{
          ...anonymous,
          signedIn: true,
          user: { id: "owner", unsafeMetadata },
        }}
      />,
    );
    expect(screen.getByTestId("sdk-redirect-target")).toHaveTextContent(/^\/mobile-number$/);
    expect(screen.queryByRole("button", { name: "Sign in / Register" })).toBeNull();
    expect(sdk.push).not.toHaveBeenCalled();
  },
);

it("keeps a restored session without an available user record in onboarding rather than granting application entry", async () => {
  await render(<Fixture session={{ ...anonymous, signedIn: true, user: null }} />);
  expect(screen.getByTestId("sdk-redirect-target")).toHaveTextContent(/^\/mobile-number$/);
});

it.each(["  +39 333 1234567  ", "contact value without phone-format validation"])(
  "uses declarative app entry for the required nonempty custom value %s",
  async (mobileNumber) => {
    await render(
      <Fixture
        session={{
          ...anonymous,
          signedIn: true,
          user: { id: "owner", unsafeMetadata: { mobileNumber } },
        }}
      />,
    );
    expect(screen.getByTestId("sdk-redirect-target")).toHaveTextContent(/^\/tables$/);
    expect(sdk.push).not.toHaveBeenCalled();
  },
);

it.each(["en", "it"] as const)(
  "renders the real %s anonymous landing and routes only after an explicit sign-in press",
  async (locale) => {
    await render(<Fixture locale={locale} session={{ ...anonymous, userLoaded: false }} />);
    expect(
      screen.getByText(
        locale === "it" ? "Benvenuto in Board Game Organizer" : "Welcome to Board Game Organizer",
      ),
    ).toBeVisible();
    expect(screen.getByText("Board Game Organizer")).toBeVisible();
    const label = locale === "it" ? "Accedi / Registrati" : "Sign in / Register";
    expect(screen.getByRole("button", { name: label })).toBeEnabled();
    expect(sdk.push).not.toHaveBeenCalled();
    await userEvent.setup().press(screen.getByRole("button", { name: label }));
    expect(sdk.push).toHaveBeenCalledExactlyOnceWith("/sign-in");
    expect(screen.queryByTestId("sdk-redirect-target")).toBeNull();
  },
);

it("reconciles actual restored metadata and logout changes without leaving the previous declarative destination mounted", async () => {
  const view = await render(
    <Fixture session={{ ...anonymous, authLoaded: false, signedIn: undefined }} />,
  );
  expect(screen.queryByTestId("sdk-redirect-target")).toBeNull();
  await view.rerender(
    <Fixture
      session={{
        ...anonymous,
        signedIn: true,
        user: { id: "owner", unsafeMetadata: {} },
      }}
    />,
  );
  expect(screen.getByTestId("sdk-redirect-target")).toHaveTextContent(/^\/mobile-number$/);
  await view.rerender(
    <Fixture
      session={{
        ...anonymous,
        signedIn: true,
        user: { id: "owner", unsafeMetadata: { mobileNumber: "complete" } },
      }}
    />,
  );
  expect(screen.getByTestId("sdk-redirect-target")).toHaveTextContent(/^\/tables$/);
  await view.rerender(<Fixture />);
  expect(screen.queryByTestId("sdk-redirect-target")).toBeNull();
  expect(screen.getByRole("button", { name: "Sign in / Register" })).toBeVisible();
  expect(sdk.push).not.toHaveBeenCalled();
});
