import {
  eventRecordQuery,
  favoriteLocationsQuery,
  recordTablesQuery,
} from "@board-game-organizer/shared";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterAll, afterEach, expect, vi } from "vitest";
import TabsLayout from "@/app/(tabs)/layout";
import MobileNumberPage from "@/app/mobile-number/page";
import SignInPage from "@/app/sign-in/[[...sign-in]]/page";
import SignUpPage from "@/app/sign-up/[[...sign-up]]/page";
import { WebDataWarmup } from "@/components/common/startup/WebDataWarmup";
import { measureWebFeature } from "./featureScenario";

const boundary = vi.hoisted(() => {
  const apiUrl = "https://startup-render.test";
  vi.stubEnv("NEXT_PUBLIC_API_URL", apiUrl);
  return {
    apiUrl,
    userId: "warm-session-owner",
    sessionId: "current-session" as string | null,
    update: vi.fn(async () => {}),
    replace: vi.fn(),
  };
});
const options = {
  apiUrl: boundary.apiUrl,
  userId: boundary.userId,
  getToken: async () => "fixture-warmup-token",
  locale: "en" as const,
};
let signedIn = false;
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: signedIn
      ? { unsafeMetadata: { preferences: "preserved" }, update: boundary.update }
      : null,
  }),
  useAuth: () => ({
    isLoaded: true,
    userId: signedIn ? boundary.userId : null,
    sessionId: boundary.sessionId,
    getToken: options.getToken,
  }),
  Show: ({ fallback }: { fallback: React.ReactNode }) => fallback,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  SignIn: () => <form aria-label="Clerk sign-in" />,
  SignUp: () => <form aria-label="Clerk sign-up" />,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: boundary.replace }),
  usePathname: () => "/tables",
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => vi.unstubAllEnvs());

measureWebFeature(
  "TabsLayout: render document layout through the authentication and startup boundaries",
  <TabsLayout>
    <p>Current route panel</p>
  </TabsLayout>,
  () => {
    const navigation = within(screen.getByRole("navigation"));
    expect(navigation.getByRole("button", { name: "Sign In" })).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute("id", "tab-content-scroll");
    expect(screen.getByText("Current route panel")).toBeVisible();
  },
  () => {
    signedIn = false;
    boundary.sessionId = null;
  },
);

measureWebFeature(
  "Clerk routes: render the sign-in and registration shells",
  <>
    <SignInPage />
    <SignUpPage />
  </>,
  () => {
    expect(screen.getByRole("form", { name: "Clerk sign-in" })).toBeVisible();
    expect(screen.getByRole("form", { name: "Clerk sign-up" })).toBeVisible();
  },
);

measureWebFeature(
  "MobileNumberPage: validate the field and submit the browser country prefix",
  <MobileNumberPage />,
  async () => {
    const submit = screen.getByRole("button", { name: "Continue" });
    const form = submit.closest("form");
    if (!form) throw new Error("Expected the mobile number form");
    fireEvent.submit(form);
    expect(screen.getByText("Enter a mobile number.")).toBeVisible();
    expect(boundary.update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "5550123" } });
    fireEvent.click(submit);
    await waitFor(() => expect(boundary.replace).toHaveBeenCalledExactlyOnceWith("/tables"));
    expect(boundary.update).toHaveBeenCalledExactlyOnceWith({
      unsafeMetadata: { preferences: "preserved", mobileNumber: "+1 5550123" },
    });
  },
  () => {
    signedIn = true;
    boundary.update.mockClear();
    boundary.replace.mockClear();
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
  },
);

let warmCache: QueryClient | undefined;
function WarmupFixture() {
  const client = useQueryClient();
  useEffect(() => {
    warmCache = client;
    return () => {
      warmCache = undefined;
    };
  }, [client]);
  return <WebDataWarmup />;
}

measureWebFeature(
  "WebDataWarmup: fill the bounded priority and background query cache",
  <WarmupFixture />,
  async () => {
    const cache = warmCache;
    if (!cache) throw new Error("Expected the measured startup query owner");
    await waitFor(() => {
      expect(cache.getQueryData(recordTablesQuery(options, null).queryKey)).toBeDefined();
      expect(cache.getQueryData(eventRecordQuery(options, "first").queryKey)).toBeDefined();
      expect(cache.getQueryData(favoriteLocationsQuery(options).queryKey)).toBeDefined();
    });
  },
  () => {
    signedIn = true;
    boundary.sessionId = "current-session";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        expect(url.origin).toBe(boundary.apiUrl);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-warmup-token");
        if (url.pathname === "/api/tables")
          return Response.json({
            items: [{ id: "table-one", eventId: "first" }],
            nextCursor: null,
          });
        if (url.pathname === "/api/bgg/account")
          return Response.json({ active: null, pending: null });
        if (url.pathname === "/api/notifications")
          return Response.json({ notifications: [], unreadCount: 0, nextCursor: null });
        if (url.pathname === "/api/users/suggestions")
          return Response.json({ users: [], hasContacts: false, nextCursor: null });
        if (url.pathname === "/api/relationships")
          return Response.json({ rows: [], nextCursor: null });
        if (url.pathname === "/api/profiles") return Response.json({ id: boundary.userId });
        return Response.json({ items: [], nextCursor: null });
      }),
    );
  },
);
