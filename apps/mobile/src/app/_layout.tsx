
import * as Sentry from "@sentry/react-native";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { HeroUINativeProvider } from "heroui-native";

import { Uniwind } from 'uniwind'
import "../../global.css";

import { RuntimeError } from "@/components/RuntimeError";

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
  console.error(
    "[Clerk] Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  );
}

function sentryFallback({ error, componentStack, resetError }: { error: any; componentStack: string; resetError: () => void }) {
  Sentry.captureException(error);
  return (
    <RuntimeError />
  );
}

export default function RootLayout() {

  console.log(Uniwind.currentTheme)
  return (
    <Sentry.ErrorBoundary fallback={sentryFallback}>
      <GestureHandlerRootView className="flex-1">
        <HeroUINativeProvider>
          <ClerkProvider
            publishableKey={publishableKey}
            tokenCache={tokenCache}
          >
            <StatusBar style="auto" />
            <Stack>
              <Stack.Screen
                name="index"
                options={{ title: "Board Game Organizer" }}
              />
              <Stack.Screen
                name="sign-in"
                options={{ title: "Accedi", presentation: "modal" }}
              />
            </Stack>
          </ClerkProvider>
        </HeroUINativeProvider>
      </GestureHandlerRootView>
    </Sentry.ErrorBoundary>
  );
}