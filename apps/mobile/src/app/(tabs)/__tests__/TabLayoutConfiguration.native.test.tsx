import { URL } from "node:url";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import type { ReactNode } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import TabLayout from "../_layout";

type User = { unsafeMetadata: Record<string, unknown>; publicMetadata: Record<string, unknown> };
type ScreenConfiguration = { name: string; options: Record<string, unknown> };
const boundary = vi.hoisted(() => ({
  authLoaded: true,
  userLoaded: true,
  signedIn: true,
  user: { unsafeMetadata: { mobileNumber: "fixture-number" }, publicMetadata: {} } as
    | User
    | undefined,
  getToken: vi.fn(async () => "fixture-tabs-token"),
  push: vi.fn(),
  permission: vi.fn(async () => ({ status: "denied", canAskAgain: false })),
  navigatorConfigurations: 0,
  animation: "",
  redirects: [] as string[],
  screens: new Map<string, ScreenConfiguration["options"]>(),
  authOptions: [] as unknown[],
}));
vi.mock("@clerk/expo", () => ({
  useAuth: (options?: unknown) => {
    boundary.authOptions.push(options);
    return {
      isLoaded: boundary.authLoaded,
      isSignedIn: boundary.signedIn,
      userId: "owner",
      sessionId: "fixture-session",
      getToken: boundary.getToken,
    };
  },
  useUser: () => ({ isLoaded: boundary.userLoaded, user: boundary.user }),
}));
// Isolated Expo navigation CONFIGURATION boundary. It exposes the SDK header
// slot and screen declarations, while every application component, React memo,
// native View and HeroUI control stays real. This is not an Expo navigator,
// route-transition, physical bottom-tab interaction or device-performance test.
vi.mock("expo-router", () => {
  function Screen({ name, options }: ScreenConfiguration) {
    boundary.screens.set(name, options);
    const muted = useThemeColor("muted");
    const title =
      typeof options.headerTitle === "function" ? (options.headerTitle as () => ReactNode)() : null;
    const icon =
      typeof options.tabBarIcon === "function"
        ? (options.tabBarIcon as (props: { color: string }) => ReactNode)({ color: muted })
        : null;
    return (
      <View>
        {title}
        {icon}
      </View>
    );
  }
  function Tabs({
    children,
    screenOptions,
  }: {
    children: ReactNode;
    screenOptions: { headerRight: () => ReactNode; animation: string };
  }) {
    boundary.navigatorConfigurations++;
    boundary.animation = screenOptions.animation;
    return (
      <View testID="tabs-navigation-configuration">
        <View>{screenOptions.headerRight()}</View>
        {children}
      </View>
    );
  }
  return {
    useRouter: () => ({ push: boundary.push }),
    Tabs: Object.assign(Tabs, { Screen }),
    Redirect: ({ href }: { href: string }) => {
      boundary.redirects.push(href);
      return <Text testID="native-sdk-redirect">{href}</Text>;
    },
  };
});
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://tab-layout-native.test" } } },
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getPermissionsAsync: boundary.permission,
}));
let client: QueryClient;
const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
const requests: URL[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  boundary.authLoaded = boundary.userLoaded = boundary.signedIn = true;
  boundary.user = { unsafeMetadata: { mobileNumber: "fixture-number" }, publicMetadata: {} };
  boundary.navigatorConfigurations = 0;
  boundary.screens.clear();
  boundary.redirects.length = 0;
  boundary.authOptions.length = 0;
  requests.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.spyOn(AppState, "addEventListener").mockReturnValue({ remove: vi.fn() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin !== "https://tab-layout-native.test" ||
        url.pathname !== "/api/notifications" ||
        (init?.method ?? "GET") !== "GET"
      )
        throw new Error(`Unexpected layout-unit HTTP request ${url.origin}${url.pathname}`);
      requests.push(url);
      return Response.json({ notifications: [], unreadCount: 0, nextCursor: null });
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (platformDescriptor) Object.defineProperty(Platform, "OS", platformDescriptor);
});
function Fixture() {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <TabLayout />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
function loadingSkeleton() {
  return screen.container.queryAll((node) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.width === 192 && style?.height === 32;
  });
}
async function ready() {
  await screen.findByTestId("tabs-navigation-configuration");
  await waitFor(() => expect(client.isFetching()).toBe(0));
}

it("preserves memoized tab configuration across equivalent session refreshes while current BGO role changes remain live", async () => {
  const view = await render(<Fixture />);
  await ready();
  const first = boundary.navigatorConfigurations;
  expect(first).toBeGreaterThan(0);
  const profile = screen.getByTestId("profile-button");
  expect(profile).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Group moderation" })).toBeNull();
  boundary.user = {
    ...boundary.user,
    unsafeMetadata: { mobileNumber: "fixture-number" },
    publicMetadata: {},
  };
  await view.rerender(<Fixture />);
  await ready();
  expect(boundary.navigatorConfigurations).toBe(first);
  expect(screen.getByTestId("profile-button")).toBe(profile);
  boundary.user = { ...boundary.user, publicMetadata: { bgoRole: "ADMIN" } };
  await view.rerender(<Fixture />);
  expect(boundary.navigatorConfigurations).toBe(first + 1);
  expect(screen.getByRole("button", { name: "Group moderation" })).toBeEnabled();
  boundary.user = { ...boundary.user, publicMetadata: {} };
  await view.rerender(<Fixture />);
  expect(screen.queryByRole("button", { name: "Group moderation" })).toBeNull();
  expect(boundary.navigatorConfigurations).toBe(first + 2);
});

it("renders actual native header actions and navigates only after the corresponding explicit press", async () => {
  boundary.user = {
    unsafeMetadata: { mobileNumber: "fixture-number" },
    publicMetadata: { bgoRole: "ADMIN" },
  };
  await render(<Fixture />);
  await ready();
  expect(screen.getByRole("button", { name: "Notifications" })).toBeEnabled();
  expect(boundary.push).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Profile" }));
  await userEvent.setup().press(screen.getByRole("button", { name: "Group moderation" }));
  expect(boundary.push.mock.calls).toEqual([["/profile"], ["/moderation"]]);
});

it("keeps declared production tabs, accessible test IDs and retired hidden routes in the actual application configuration", async () => {
  await render(<Fixture />);
  await ready();
  expect([...boundary.screens.keys()]).toEqual([
    "tables",
    "events",
    "groups",
    "community",
    "organizations",
    "matches",
    "contacts",
  ]);
  for (const [name, title] of [
    ["tables", "History"],
    ["events", "Events"],
    ["groups", "Groups"],
    ["community", "Community"],
    ["contacts", "Contacts"],
  ]) {
    expect(boundary.screens.get(name)).toMatchObject({
      title,
      tabBarButtonTestID: `main-tab-${name}`,
    });
    expect(boundary.screens.get(name)?.headerTitle).toBeTypeOf("function");
    expect(boundary.screens.get(name)?.tabBarIcon).toBeTypeOf("function");
  }
  expect(boundary.screens.get("organizations")).toEqual({ href: null });
  expect(boundary.screens.get("matches")).toEqual({ href: null });
});

it.each([undefined, "", "   ", 42])(
  "redirects a signed-in user without a usable mobile number (%s) before mounting private tabs",
  async (number) => {
    boundary.user = {
      unsafeMetadata: { mobileNumber: number },
      publicMetadata: { bgoRole: "ADMIN" },
    };
    await render(<Fixture />);
    expect(screen.getByTestId("native-sdk-redirect")).toHaveTextContent("/mobile-number");
    expect(boundary.redirects).toEqual(["/mobile-number"]);
    expect(boundary.navigatorConfigurations).toBe(0);
    expect(requests).toHaveLength(0);
  },
);

it("keeps access checks reactive after a previously admitted user's mobile number is removed", async () => {
  const view = await render(<Fixture />);
  await ready();
  boundary.user = { unsafeMetadata: {}, publicMetadata: {} };
  await view.rerender(<Fixture />);
  expect(screen.getByTestId("native-sdk-redirect")).toHaveTextContent("/mobile-number");
  expect(screen.queryByTestId("tabs-navigation-configuration")).toBeNull();
  expect(screen.queryByRole("button", { name: "Profile" })).toBeNull();
});

it("redirects a signed-out session to the public entry before inspecting phone metadata", async () => {
  boundary.signedIn = false;
  boundary.user = undefined;
  await render(<Fixture />);
  expect(screen.getByTestId("native-sdk-redirect")).toHaveTextContent("/");
  expect(boundary.redirects).toEqual(["/"]);
  expect(boundary.navigatorConfigurations).toBe(0);
  expect(requests).toHaveLength(0);
});

it.each(["auth", "signed-in-user"] as const)(
  "shows the actual HeroUI loading skeleton for pending %s without redirecting",
  async (pending) => {
    if (pending === "auth") boundary.authLoaded = false;
    else boundary.userLoaded = false;
    await render(<Fixture />);
    expect(loadingSkeleton().length).toBeGreaterThan(0);
    expect(screen.queryByTestId("native-sdk-redirect")).toBeNull();
    expect(screen.queryByTestId("tabs-navigation-configuration")).toBeNull();
    expect(boundary.redirects).toEqual([]);
    expect(requests).toHaveLength(0);
    expect(boundary.authOptions).toContainEqual({ treatPendingAsSignedOut: false });
  },
);

it("does not grant administrator controls from user-editable metadata", async () => {
  boundary.user = {
    unsafeMetadata: { mobileNumber: "fixture-number", bgoRole: "ADMIN" },
    publicMetadata: {},
  };
  await render(<Fixture />);
  await ready();
  expect(screen.getByTestId("profile-button")).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Group moderation" })).toBeNull();
});

it.each([
  { os: "android", animation: "none" },
  { os: "ios", animation: "fade" },
] as const)(
  "declares the $os navigator animation policy at the SDK configuration boundary",
  async ({ os, animation }) => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: os });
    await render(<Fixture />);
    await ready();
    expect(boundary.animation).toBe(animation);
    expect(screen.getByRole("header", { name: "History" })).toBeVisible();
  },
);
