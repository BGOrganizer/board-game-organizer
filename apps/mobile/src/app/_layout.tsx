import { QueryProvider } from "@board-game-organizer/query";
import { useAppStore } from "@board-game-organizer/store";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { I18nProvider } from "@lingui/react";
import * as Sentry from "@sentry/react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Uniwind } from "uniwind";
import "../../global.css";

import { RuntimeError } from "@/components/RuntimeError";
import { defaultI18n, useT } from "@/lib/i18n";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

// Session Replay (mobileReplayIntegration) e Feedback solo in dev:
// crash noti all'avvio nelle build Android Release con New Architecture/Fabric
// (getsentry/sentry-react-native#3990, #6154, #6122)
const sentryIntegrations = __DEV__
  ? [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()]
  : [];

Sentry.init({
  dsn: sentryDsn,

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: sentryIntegrations,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

if (!publishableKey) {
  console.error("[Clerk] Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
}

// Forward console.error to Sentry: render loops and React warnings (e.g.
// "Maximum update depth exceeded") are only logged, never thrown — this
// bridge makes them visible in Sentry for diagnostics.
if (__DEV__ === false) {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    try {
      const message = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
      Sentry.captureMessage(message, "error");
    } catch {
      // never let the bridge break the app
    }
  };
}

function sentryFallback({ error, componentStack }: { error: unknown; componentStack: string }) {
  Sentry.captureException(error);
  return (
    <RuntimeError
      message={error instanceof Error ? error.message : String(error)}
      componentStack={componentStack}
    />
  );
}

/**
 * Syncs the Zustand theme preference with the uniwind runtime theme.
 * "system" (the default) lets uniwind follow the device Appearance
 * automatically; a manual light/dark override is applied explicitly.
 */
function ThemeSync() {
  const themePreference = useAppStore((s) => s.themePreference);
  useEffect(() => {
    Uniwind.setTheme(themePreference);
  }, [themePreference]);
  return null;
}

function RootNavigator() {
  const t = useT();
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <QueryProvider>
        <ThemeSync />
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="index" options={{ title: "Board Game Organizer" }} />
          <Stack.Screen name="sign-in" options={{ title: t("Sign in"), presentation: "modal" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </QueryProvider>
    </ClerkProvider>
  );
}

export default function RootLayout() {
  return (
    <Sentry.ErrorBoundary fallback={sentryFallback}>
      <GestureHandlerRootView className="flex-1">
        <HeroUINativeProvider>
          <I18nProvider i18n={defaultI18n}>
            <RootNavigator />
          </I18nProvider>
        </HeroUINativeProvider>
      </GestureHandlerRootView>
    </Sentry.ErrorBoundary>
  );
}
