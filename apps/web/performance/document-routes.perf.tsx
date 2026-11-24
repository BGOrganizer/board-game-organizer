import { configure, measureRenders } from "@callstack/reassure-measure";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import GlobalError from "@/app/global-error";
import RootLayout from "@/app/layout";
import Home from "@/app/page";
import PublicInvitePage from "../../api/src/app/invite/[token]/page";
import PublicInviteLayout from "../../api/src/app/invite/layout";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
const signInOptions = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => sentry);
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null }) }));
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, userId: null }),
  useUser: () => ({ isLoaded: true, user: null }),
  Show: ({
    when,
    children,
    fallback,
  }: {
    when: string;
    children: ReactNode;
    fallback?: ReactNode;
  }) => (when === "signed-out" ? children : fallback),
  SignInButton: ({ children, ...options }: { children: ReactNode }) => {
    signInOptions(options);
    return children;
  },
  SignUpButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("The signed-out home must not redirect");
  },
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "accept-language": "en-US" }),
}));
vi.mock("next/script", () => ({ default: () => null }));

let frame: HTMLIFrameElement | undefined;
function currentDocument() {
  if (!frame?.contentDocument) throw new Error("Expected the current measured route document");
  return frame.contentDocument;
}
function renderDocument(element: ReactElement) {
  frame = document.createElement("iframe");
  document.body.append(frame);
  const target = currentDocument();
  return render(element, { container: target, baseElement: target });
}
function cleanupDocument() {
  cleanup();
  frame?.remove();
  frame = undefined;
}
afterEach(() => {
  cleanupDocument();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("lang");
  delete document.documentElement.dataset.theme;
});

const root = "RootLayout: render the resolved signed-out document and localized onboarding";
test(root, async () => {
  const page = await RootLayout({ children: await Home() });
  configure({
    testingLibrary: { render: renderDocument, cleanup: cleanupDocument },
    runs: 10,
    warmupRuns: 1,
  });
  const result = await measureRenders(page, {
    scenario: async () => {
      const doc = currentDocument();
      expect(doc.documentElement).toHaveAttribute("lang", "en");
      const view = within(doc.body);
      expect(view.getByRole("navigation")).toBeVisible();
      const main = within(view.getByRole("main"));
      expect(main.getByRole("heading", { name: "Welcome to Board Game Organizer" })).toBeVisible();
      expect(main.getByRole("button", { name: "Sign In" })).toBeVisible();
      expect(main.getByRole("button", { name: "Sign Up" })).toBeVisible();
    },
  });
  assertRenderMeasurement(result, root);
});

const failure = "GlobalError: report a render exception and offer an accessible retry";
test(failure, async () => {
  const error = new Error("Private exception details");
  const retry = vi.fn();
  configure({
    testingLibrary: { render: renderDocument, cleanup: cleanupDocument },
    runs: 10,
    warmupRuns: 1,
  });
  const result = await measureRenders(<GlobalError error={error} reset={retry} />, {
    beforeEach: () => {
      sentry.captureException.mockClear();
      retry.mockClear();
    },
    scenario: async () => {
      const doc = currentDocument();
      const view = within(doc.body);
      expect(view.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
      expect(doc.body).not.toHaveTextContent(error.message);
      expect(sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
      fireEvent.click(view.getByRole("button", { name: "Try again" }));
      expect(retry).toHaveBeenCalledOnce();
    },
  });
  assertRenderMeasurement(result, failure);
});

const publicInvite =
  "Public invite route: offer the app handoff and remember explicit sign-in intent";
test(publicInvite, async () => {
  const token = "abcdefghijklmnopqrstuv";
  const intentKey = `bgo:invite-claim:${token}`;
  const callback = `/invite/${token}?claim=1`;
  vi.stubEnv("VERCEL_ENV", "production");
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
  const noRequests = vi.fn();
  vi.stubGlobal("fetch", noRequests);
  const page = await PublicInvitePage({ params: Promise.resolve({ token }) });
  configure({
    testingLibrary: { render: renderDocument, cleanup: cleanupDocument },
    runs: 10,
    warmupRuns: 1,
  });
  const result = await measureRenders(<PublicInviteLayout>{page}</PublicInviteLayout>, {
    beforeEach: () => {
      window.sessionStorage.removeItem(intentKey);
      signInOptions.mockClear();
    },
    scenario: async () => {
      const view = within(currentDocument().body);
      expect(view.getByRole("link", { name: "Open in app" })).toHaveAttribute(
        "href",
        `bgo:///invite/${token}`,
      );
      expect(view.getByRole("heading", { name: "You have been invited" })).toBeVisible();
      expect(window.sessionStorage.getItem(intentKey)).toBeNull();
      expect(signInOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          forceRedirectUrl: callback,
          signUpForceRedirectUrl: callback,
        }),
      );
      fireEvent.click(view.getByRole("button", { name: "Sign in to claim" }));
      expect(Number(window.sessionStorage.getItem(intentKey))).toBeGreaterThan(Date.now() - 1000);
      expect(noRequests).not.toHaveBeenCalled();
    },
    afterEach: () => window.sessionStorage.removeItem(intentKey),
  });
  assertRenderMeasurement(result, publicInvite);
});
