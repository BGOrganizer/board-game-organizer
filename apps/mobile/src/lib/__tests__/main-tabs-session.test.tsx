// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import * as schemas from "@board-game-organizer/schemas";
import * as React from "react";
import * as runtime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Real React memo/guard behavior with substituted native hosts; not device timing evidence.
it("keeps navigator options stable on session refresh while access and role changes stay live", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const state = {
    authLoaded: true,
    userLoaded: true,
    signedIn: true,
    user: { unsafeMetadata: { mobileNumber: "fixture" }, publicMetadata: {} },
  };
  let navigatorRenders = 0;
  const host = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  function Tabs({ screenOptions }: { screenOptions: { headerRight(): React.ReactNode } }) {
    navigatorRenders++;
    return <>{screenOptions.headerRight()}</>;
  }
  Tabs.Screen = () => null;
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": runtime,
    "@board-game-organizer/schemas": schemas,
    "@clerk/expo": {
      useAuth: () => ({ isLoaded: state.authLoaded, isSignedIn: state.signedIn }),
      useUser: () => ({ isLoaded: state.userLoaded, user: state.user }),
    },
    "expo-router": {
      Tabs,
      useRouter: () => ({ push: vi.fn() }),
      Redirect: ({ href }: { href: string }) => <span>{href}</span>,
    },
    "react-native": { View: host, Platform: { OS: "android" } },
    "heroui-native/button": {
      Button: ({ accessibilityLabel }: { accessibilityLabel: string }) => (
        <button type="button">{accessibilityLabel}</button>
      ),
    },
    "heroui-native/hooks": { useThemeColor: () => ["foreground", "muted"] },
    "heroui-native/skeleton": { Skeleton: () => <span>loading</span> },
    "lucide-react-native": new Proxy({}, { get: () => () => null }),
    "@/components/common/layout/HeaderTitle": { HeaderTitle: host },
    "@/components/common/layout/headerStyles": { headerButtonProps: {}, HEADER_ICON_SIZE: 20 },
    "@/components/notifications/NotificationBell": { NotificationBell: () => null },
    "@/components/notifications/NotificationNavigationBadge": {
      NotificationNavigationBadge: () => null,
    },
    "@/lib/i18n": { useT: () => (text: string) => text },
  };
  const exports: { default?: React.ComponentType } = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "../../app/(tabs)/_layout.tsx"),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
    ).outputText,
    {
      exports,
      require: (name: string) => {
        if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
        return modules[name];
      },
    },
  );
  const Layout = exports.default as React.ComponentType;
  const container = Reflect.get(globalThis, "document").createElement("div");
  const root = createRoot(container);
  const render = () => React.act(async () => root.render(<Layout />));
  try {
    await render();
    expect(navigatorRenders).toBe(1);
    expect(container.textContent).toBe("Profile");
    state.user = { ...state.user, publicMetadata: {} };
    await render();
    expect(navigatorRenders).toBe(1);
    state.user.publicMetadata = { bgoRole: "ADMIN" };
    await render();
    expect(navigatorRenders).toBe(2);
    expect(container.textContent).toContain("Group moderation");
    state.user.publicMetadata = {};
    await render();
    expect(container.textContent).not.toContain("Group moderation");
    state.user.unsafeMetadata.mobileNumber = "";
    await render();
    expect(container.textContent).toBe("/mobile-number");
    state.signedIn = false;
    await render();
    expect(container.textContent).toBe("/");
    state.authLoaded = false;
    await render();
    expect(container.textContent).toContain("loading");
    state.authLoaded = true;
    state.signedIn = true;
    state.userLoaded = false;
    await render();
    expect(container.textContent).toContain("loading");
  } finally {
    await React.act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
