import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import { createRef, type ReactNode, type Ref, useImperativeHandle, useState } from "react";
import { View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TabLayout from "@/app/(tabs)/_layout";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  admin: false,
  push: vi.fn(),
  token: vi.fn(async () => "fixture-tabs-token"),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "owner",
    sessionId: "fixture-tabs-session",
    getToken: boundary.token,
  }),
  useUser: () => ({
    isLoaded: true,
    user: {
      unsafeMetadata: { mobileNumber: "fixture-number" },
      publicMetadata: boundary.admin ? { bgoRole: "ADMIN" } : {},
    },
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  // Exercise the app's actual slot renderers without constructing a native navigator in Node.
  Tabs: Object.assign(
    ({
      children,
      screenOptions,
    }: {
      children: ReactNode;
      screenOptions: { headerRight: () => ReactNode };
    }) => (
      <View>
        {screenOptions.headerRight()}
        {children}
      </View>
    ),
    {
      Screen: ({
        options,
      }: {
        options: {
          headerTitle?: () => ReactNode;
          tabBarIcon?: (props: { color: string }) => ReactNode;
        };
      }) => {
        const color = useThemeColor("muted");
        return (
          <View>
            {options.headerTitle?.()}
            {options.tabBarIcon?.({ color })}
          </View>
        );
      },
    },
  ),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://tab-layout-render.test" } } },
}));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getPermissionsAsync: vi.fn(async () => ({ status: "denied", canAskAgain: false })),
}));

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      expect(url.origin).toBe("https://tab-layout-render.test");
      expect(url.pathname).toBe("/api/notifications");
      expect(init?.method ?? "GET").toBe("GET");
      return Response.json({ notifications: [], unreadCount: 0, nextCursor: null });
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

function LiveTabs({ refresh }: { refresh: Ref<(admin: boolean) => void> }) {
  const [, setSessionRevision] = useState(0);
  useImperativeHandle(
    refresh,
    () => (admin: boolean) => {
      boundary.admin = admin;
      setSessionRevision((revision) => revision + 1);
    },
    [],
  );
  return (
    <QueryClientProvider client={client}>
      <TabLayout />
    </QueryClientProvider>
  );
}

it("TabLayout: retain equivalent navigation controls and expose moderation after a role update", async () => {
  const refresh = createRef<(admin: boolean) => void>();
  const result = await measureRenders(<LiveTabs refresh={refresh} />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      client.clear();
      boundary.admin = false;
      boundary.push.mockClear();
    },
    scenario: async () => {
      await waitFor(() => expect(client.isFetching()).toBe(0));
      expect(screen.getByRole("header", { name: "History" })).toBeVisible();
      const profile = screen.getByTestId("profile-button");
      expect(screen.queryByRole("button", { name: "Group moderation" })).toBeNull();
      await act(() => refresh.current?.(false));
      expect(screen.getByTestId("profile-button")).toBe(profile);
      await act(() => refresh.current?.(true));
      await userEvent.setup().press(screen.getByRole("button", { name: "Group moderation" }));
      expect(boundary.push).toHaveBeenCalledExactlyOnceWith("/moderation");
    },
  });
  assertRenderMeasurement(result);
});
