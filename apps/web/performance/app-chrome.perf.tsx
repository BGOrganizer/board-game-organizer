import { notificationListKey } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { toast } from "@heroui/react/toast";
import { useQueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterAll, afterEach, beforeEach, expect, vi } from "vitest";
import { LoginFallback } from "@/components/auth/LoginFallback";
import { MobileNumberGate } from "@/components/auth/MobileNumberGate";
import { Header } from "@/components/common/layout/Header";
import { HeaderActions } from "@/components/common/layout/HeaderActions";
import { HeaderBackButton } from "@/components/common/layout/HeaderBackButton";
import { InputBehavior } from "@/components/common/providers/InputBehavior";
import { LinguiClientProvider } from "@/components/common/providers/LinguiClientProvider";
import { SessionQueryProvider } from "@/components/common/providers/SessionQueryProvider";
import { ThemeScript } from "@/components/common/providers/ThemeScript";
import { messages } from "../../../messages/en.js";
import { measureWebFeature } from "./featureScenario";

const boundary = vi.hoisted(() => {
  const apiUrl = "https://header-render.test";
  vi.stubEnv("NEXT_PUBLIC_API_URL", apiUrl);
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
  return {
    apiUrl,
    user: null as { id: string; firstName: string; unsafeMetadata: Record<string, unknown> } | null,
    sessionId: null as string | null,
    isLoaded: true,
    getToken: async () => "fixture-header-token",
    router: { replace: vi.fn(), push: vi.fn() },
  };
});

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: boundary.isLoaded, user: boundary.user }),
  useAuth: () => ({
    userId: boundary.user?.id ?? null,
    sessionId: boundary.sessionId,
    isLoaded: boundary.isLoaded,
    isSignedIn: Boolean(boundary.user),
    getToken: boundary.getToken,
  }),
  Show: ({ fallback, children }: { fallback: ReactNode; children: ReactNode }) =>
    boundary.user ? children : fallback,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignUpButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => boundary.router,
  usePathname: () => "/events/friday",
}));
vi.mock("next/script", () => ({ default: () => null }));

const owner = { id: "render-owner", firstName: "Viewer", unsafeMetadata: { mobileNumber: "555" } };
const notify = {
  notifications: [],
  unreadCount: 1,
  nextCursor: null,
  attention: { tables: 0, events: 1, groups: 0, contacts: 0 },
};

beforeEach(() => {
  vi.stubGlobal("Notification", { permission: "denied" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe(boundary.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-header-token");
      if (url.pathname === "/api/profiles" && init?.method === "PATCH") {
        return Response.json({ preferredLanguage: "en" });
      }
      expect(url.pathname).toBe("/api/notifications");
      return Response.json(notify);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  useAppStore.setState({ themePreference: "system" });
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.theme;
});
afterAll(() => vi.unstubAllEnvs());

function AuthenticatedHeader() {
  const client = useQueryClient();
  const [left, setLeft] = useState(false);
  useState(() => {
    client.setQueryData(
      notificationListKey({ apiUrl: boundary.apiUrl, userId: owner.id, locale: "en" }, 3),
      {
        pages: [notify],
        pageParams: [undefined],
      },
    );
  });
  return (
    <>
      <Header />
      <HeaderActions back={<HeaderBackButton onPress={() => setLeft(true)} />}>
        <button type="button">Edit event</button>
      </HeaderActions>
      {left && <p>Returned to events</p>}
    </>
  );
}

measureWebFeature(
  "Header: switch the responsive navigation menu and use the separate page Back action",
  <AuthenticatedHeader />,
  () => {
    const nav = within(screen.getByRole("navigation"));
    expect(nav.getByRole("link", { name: "Profile" })).toBeVisible();
    expect(nav.getByRole("button", { name: "Notifications" })).toBeVisible();
    expect(nav.getByRole("link", { name: /^Events(?:\s*Needs attention)?$/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const toggle = nav.getByRole("button", { name: "Toggle menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(nav.getAllByRole("link", { name: /^Events(?:\s*Needs attention)?$/ })).toHaveLength(2);
    fireEvent.click(toggle);
    expect(nav.getAllByRole("link", { name: /^Events(?:\s*Needs attention)?$/ })).toHaveLength(1);
    expect(nav.queryByRole("button", { name: "Back" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Returned to events")).toBeVisible();
  },
  () => {
    boundary.isLoaded = true;
    boundary.user = owner;
    boundary.sessionId = "session-header";
  },
);

function GateTransitions() {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          boundary.isLoaded = true;
          boundary.user = owner;
          setLoaded(true);
        }}
      >
        Finish authentication
      </button>
      <MobileNumberGate>
        {loaded ? <p>Protected board game history</p> : <LoginFallback />}
      </MobileNumberGate>
    </>
  );
}

measureWebFeature(
  "MobileNumberGate: reveal protected content after the authentication callback",
  <GateTransitions />,
  () => {
    expect(screen.getByRole("status")).toHaveTextContent("Loading profile");
    expect(screen.queryByText("Protected board game history")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finish authentication" }));
    expect(screen.getByText("Protected board game history")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
    expect(boundary.router.replace).not.toHaveBeenCalled();
  },
  () => {
    boundary.router.replace.mockClear();
    boundary.isLoaded = false;
    boundary.user = null;
  },
);

measureWebFeature(
  "LoginFallback: show actual signed-out onboarding controls",
  <LoginFallback />,
  () => {
    expect(screen.getByRole("heading", { name: "Welcome to Board Game Organizer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign Up" })).toBeVisible();
  },
);

function PrivateCache() {
  const client = useQueryClient();
  const [value, setValue] = useState(client.getQueryData<string>(["private"]));
  return (
    <>
      <button
        type="button"
        onClick={() => {
          client.setQueryData(["private"], "Owner history");
          setValue("Owner history");
        }}
      >
        Load private cache
      </button>
      <p>{value ?? "No cached history"}</p>
    </>
  );
}

function SessionSwitch() {
  const [, setSession] = useState(boundary.sessionId);
  return (
    <>
      <SessionQueryProvider>
        <PrivateCache />
      </SessionQueryProvider>
      <button
        type="button"
        onClick={() => {
          boundary.sessionId = "session-two";
          setSession(boundary.sessionId);
        }}
      >
        Switch account session
      </button>
    </>
  );
}

measureWebFeature(
  "SessionQueryProvider: discard the previous session cache after switching",
  <SessionSwitch />,
  () => {
    fireEvent.click(screen.getByRole("button", { name: "Load private cache" }));
    expect(screen.getByText("Owner history")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Switch account session" }));
    expect(screen.getByText("No cached history")).toBeVisible();
    expect(screen.queryByText("Owner history")).toBeNull();
  },
  () => {
    boundary.isLoaded = true;
    boundary.user = owner;
    boundary.sessionId = "session-one";
  },
);

measureWebFeature(
  "LinguiClientProvider: render and dismiss the localized HeroUI toast",
  <LinguiClientProvider initialLocale="en" initialMessages={messages}>
    <button type="button" onClick={() => toast("Saved")}>
      Show result
    </button>
  </LinguiClientProvider>,
  async () => {
    fireEvent.click(screen.getByRole("button", { name: "Show result" }));
    expect(await screen.findByText("Saved")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    await waitFor(() => expect(screen.queryByText("Saved")).toBeNull());
  },
);

measureWebFeature(
  "ThemeScript and InputBehavior: apply a theme change with the page effects mounted",
  <>
    <ThemeScript />
    <InputBehavior />
  </>,
  () => {
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("light");
    expect(root.style.getPropertyValue("--app-visible-height")).toBe(`${window.innerHeight}px`);
    act(() => useAppStore.getState().setThemePreference("dark"));
    expect(root.dataset.theme).toBe("dark");
    expect(root).toHaveClass("dark");
    act(() => useAppStore.getState().setThemePreference("light"));
    expect(root.dataset.theme).toBe("light");
  },
  () => {
    useAppStore.setState({ themePreference: "light" });
  },
);
