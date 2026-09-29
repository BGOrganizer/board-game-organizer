import * as Sentry from "@sentry/react-native";
import * as SplashScreen from "expo-splash-screen";
import { STARTUP_SPLASH_LIMIT_MS } from "./startup";

export const startupStartedAt = Date.now();
void SplashScreen.preventAutoHideAsync().catch(Sentry.captureException);

// Native splash must release even if startup UI never mounts or an API hangs.
const failsafe = setTimeout(() => {
  void SplashScreen.hideAsync().catch(Sentry.captureException);
}, STARTUP_SPLASH_LIMIT_MS);

export function hideStartupSplash() {
  clearTimeout(failsafe);
  void SplashScreen.hideAsync().catch(Sentry.captureException);
}
