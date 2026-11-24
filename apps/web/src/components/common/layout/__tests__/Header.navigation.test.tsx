import type { NotificationListResponse } from "@board-game-organizer/schemas";
import { clearSessionQueryCache, notificationListKey } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { NotificationNavigationBadge } from "@/components/notifications/NotificationNavigationBadge";
import { renderWithI18n } from "@/test-utils";
import { messages as italian } from "../../../../../../../messages/it.js";
import { Header } from "../Header";
import { HeaderActions } from "../HeaderActions";

const sdk = vi.hoisted(() => {
  const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://header-navigation-fixtures.test";
  return {
    previousApiUrl,
    signedIn: true,
    pathname: "/events/current-event",
    metadata: {} as Record<string, unknown>,
    getToken: vi.fn<() => Promise<string | null>>(),
    push: vi.fn(),
  };
});
// Authentication controls are a Clerk SDK boundary. Application navigation,
// notifications, summary badges, shared hooks and HeroUI controls remain real.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: sdk.signedIn ? "viewer" : null,
    isLoaded: true,
    isSignedIn: sdk.signedIn,
    getToken: sdk.getToken,
  }),
  useUser: () => ({
    user: sdk.signedIn ? { id: "viewer", firstName: "Viewer", publicMetadata: sdk.metadata } : null,
  }),
  Show: ({
    when,
    fallback,
    children,
  }: {
    when: string;
    fallback?: ReactNode;
    children: ReactNode;
  }) => ((when === "signed-in") === sdk.signedIn ? children : fallback),
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignUpButton: ({ children }: { children: ReactNode }) => children,
  UserButton: () => <button type="button" aria-label="Clerk user menu" />,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => sdk.pathname,
  useRouter: () => ({ push: sdk.push }),
}));

const API = "https://header-navigation-fixtures.test";
const key = notificationListKey({ apiUrl: API, userId: "viewer", locale: "en" }, 3);
const initialPage: NotificationListResponse = {
  notifications: [],
  unreadCount: 0,
  nextCursor: null,
  attention: {
    tables: 0,
    events: 0,
    groups: 0,
    contacts: 0,
    sections: { connections: 0, requests: 0, search: 0 },
  },
};
let client: QueryClient;
const writes: string[] = [];
const reads: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  sdk.signedIn = true;
  sdk.pathname = "/events/current-event";
  sdk.metadata = {};
  sdk.getToken.mockResolvedValue("fresh-header-token");
  writes.length = reads.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(key, { pages: [initialPage], pageParams: [undefined] });
  vi.stubGlobal("Notification", { permission: "denied" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-header-token");
      if (url.pathname === "/api/profiles" && init?.method === "PATCH") {
        expect(JSON.parse(String(init.body))).toEqual({ preferredLanguage: "en" });
        return Response.json({ preferredLanguage: "en" });
      }
      if (init?.method && init.method !== "GET") {
        writes.push(url.pathname);
        throw new Error(`Unexpected header mutation: ${init.method} ${url.pathname}`);
      }
      expect(url.pathname).toBe("/api/notifications");
      reads.push(url.pathname);
      return Response.json(initialPage);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  vi.unstubAllGlobals();
});
afterAll(() => {
  if (sdk.previousApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = sdk.previousApiUrl;
});
function mount(actions?: ReactNode) {
  const tree = () => (
    <QueryClientProvider client={client}>
      <Header />
      {actions}
    </QueryClientProvider>
  );
  const view = renderWithI18n(tree());
  return { ...view, refresh: () => view.rerender(tree()) };
}
function linksTo(path: string) {
  return screen.getAllByRole("link").filter((link) => link.getAttribute("href") === path);
}

it("keeps route Back and actions below the global navigation", () => {
  mount(
    <HeaderActions
      back={
        <a href="/events" aria-label="Back">
          <svg aria-hidden="true" />
        </a>
      }
    >
      <button type="button">Edit resource</button>
    </HeaderActions>,
  );
  const nav = screen.getByRole("navigation");
  const back = screen.getByRole("link", { name: "Back" });
  const action = screen.getByRole("button", { name: "Edit resource" });
  expect(nav.contains(action)).toBe(false);
  expect(nav.contains(back)).toBe(false);
  expect(action.closest("[data-page-toolbar]")).toBe(back.closest("[data-page-toolbar]"));
  expect(within(nav).getByRole("link", { name: "Profile" })).toBeVisible();
  expect(within(nav).getByRole("button", { name: "Notifications" })).toBeVisible();
});

it("closes the mobile menu after activating its real nested-route navigation link without reading notices", async () => {
  mount();
  const toggle = screen.getByRole("button", { name: "Toggle menu" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(linksTo("/events")).toHaveLength(1);
  expect(linksTo("/events")[0]).toHaveAttribute("aria-current", "page");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const mobileLink = linksTo("/events")[1];
  if (!mobileLink) throw new Error("Expected a mobile Events navigation link");
  expect(mobileLink).toHaveAttribute("aria-current", "page");
  fireEvent.click(mobileLink);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
  expect(linksTo("/events")).toHaveLength(1);
  expect(writes).toEqual([]);
  expect(reads).toEqual([]);
  expect(client.getQueryData(key)).toEqual({ pages: [initialPage], pageParams: [undefined] });
});

it("updates both open-menu and desktop attention markers from the authoritative shared cache and preserves them after navigation", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
  for (const link of linksTo("/events"))
    expect(within(link).queryByRole("img", { name: "Needs attention" })).toBeNull();
  const updated: NotificationListResponse = {
    ...initialPage,
    attention: {
      ...initialPage.attention,
      tables: 0,
      events: 2,
      groups: 1,
      contacts: 0,
      sections: { connections: 0, requests: 0, search: 0 },
    },
  };
  await act(async () => client.setQueryData(key, { pages: [updated], pageParams: [undefined] }));
  for (const path of ["/events", "/groups"]) {
    const matches = linksTo(path);
    expect(matches).toHaveLength(2);
    for (const link of matches)
      expect(within(link).getByRole("img", { name: "Needs attention" })).toBeVisible();
  }
  for (const link of linksTo("/contacts"))
    expect(within(link).queryByRole("img", { name: "Needs attention" })).toBeNull();
  const mobileGroup = linksTo("/groups")[1];
  if (!mobileGroup) throw new Error("Expected a mobile Groups link");
  fireEvent.click(mobileGroup);
  await waitFor(() => expect(linksTo("/groups")).toHaveLength(1));
  expect(within(linksTo("/groups")[0]).getByRole("img", { name: "Needs attention" })).toBeVisible();
  expect(client.getQueryData(key)).toEqual({ pages: [updated], pageParams: [undefined] });
  expect(writes).toEqual([]);
});

it("reacts to authenticated role loss and logout without leaving moderation or private navigation controls behind", async () => {
  sdk.metadata = { bgoRole: "ADMIN" };
  const view = mount();
  expect(screen.getByRole("link", { name: "Group moderation" })).toHaveAttribute(
    "href",
    "/moderation",
  );
  const moderation = screen.getByRole("link", { name: "Group moderation" });
  const profile = screen.getByRole("link", { name: "Profile" });
  expect(
    moderation.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Clerk user menu" })).toBeNull();
  sdk.metadata = { role: "ADMIN" };
  view.refresh();
  expect(screen.queryByRole("link", { name: "Group moderation" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
  expect(linksTo("/events")).toHaveLength(2);
  sdk.signedIn = false;
  view.refresh();
  expect(screen.queryByRole("link", { name: /Events/ })).toBeNull();
  expect(screen.queryByRole("link", { name: "Profile" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Sign In" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Sign Up" })).toHaveLength(2);
  expect(writes).toEqual([]);
});

it("shows only the attention snapshot for the current locale without fetching or reading notices", async () => {
  const i18n = setupI18n({ locale: "it", messages: { it: italian } });
  const localized = notificationListKey({ apiUrl: API, userId: "viewer", locale: "it" }, 3);
  const count = {
    ...initialPage.attention,
    events: 3,
    sections: { connections: 0, requests: 0, search: 0 },
  };
  client.setQueryData(localized, {
    pages: [{ ...initialPage, attention: count }],
    pageParams: [undefined],
  });
  renderWithI18n(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <NotificationNavigationBadge section="events" />
        <NotificationNavigationBadge section="groups" />
      </I18nProvider>
    </QueryClientProvider>,
  );
  expect(screen.getAllByRole("img", { name: "Da verificare" })).toHaveLength(1);
  await act(() =>
    client.setQueryData(key, {
      pages: [{ ...initialPage, attention: { ...count, events: 0, groups: 2 } }],
      pageParams: [undefined],
    }),
  );
  expect(screen.getAllByRole("img", { name: "Da verificare" })).toHaveLength(1);
  await act(() =>
    client.setQueryData(localized, { pages: [initialPage], pageParams: [undefined] }),
  );
  await waitFor(() => expect(screen.queryByRole("img", { name: "Da verificare" })).toBeNull());
  expect(reads).toEqual([]);
  expect(writes).toEqual([]);
});
