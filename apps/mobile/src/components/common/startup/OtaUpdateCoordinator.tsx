import { useAppStore } from "@board-game-organizer/store";
import * as Sentry from "@sentry/react-native";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useNavigationContainerRef } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect, useRef, useState } from "react";
import { AppState, Keyboard } from "react-native";
import { ConfirmDialog } from "@/components/common/ui/ConfirmDialog";
import { useAppRestartGuard } from "@/lib/appRestartGuard";
import { useT } from "@/lib/i18n";
import {
  createUpdateController,
  isRestartSafeNavigation,
  type UpdatePhase,
} from "@/lib/otaUpdates";

export function OtaUpdateCoordinator({ startupSettled }: { startupSettled: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigationRef = useNavigationContainerRef();
  const [navigation, setNavigation] = useState(() =>
    navigationRef.isReady() ? navigationRef.getRootState() : undefined,
  );
  const mutations = useIsMutating();
  const blocks = useAppRestartGuard((state) => state.blocks);
  const pendingSelection = useAppStore((state) =>
    Boolean(state.pendingUser || state.pendingGame || state.pendingLocation),
  );
  const [active, setActive] = useState(AppState.currentState === "active");
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const enabled =
    !__DEV__ &&
    Updates.isEnabled &&
    Updates.checkAutomatically === Updates.UpdatesCheckAutomaticallyValue.NEVER;
  const safe =
    enabled &&
    startupSettled &&
    active &&
    !keyboardVisible &&
    !mutations &&
    !blocks &&
    !pendingSelection &&
    isRestartSafeNavigation(navigation);
  const latest = useRef(startupSettled);
  latest.current = startupSettled;
  const controller = useRef<ReturnType<typeof createUpdateController> | null>(null);

  useEffect(() => {
    const current = createUpdateController({
      check: async () => {
        const result = await Updates.checkForUpdateAsync();
        return result.isAvailable || result.isRollBackToEmbedded;
      },
      download: async () => {
        const result = await Updates.fetchUpdateAsync();
        return result.isNew || result.isRollBackToEmbedded;
      },
      reload: () => Updates.reloadAsync(),
      canRestart: () => {
        const selections = useAppStore.getState();
        return Boolean(
          enabled &&
            latest.current &&
            AppState.currentState === "active" &&
            !Keyboard.isVisible() &&
            !queryClient.isMutating() &&
            !useAppRestartGuard.getState().blocks &&
            !selections.pendingUser &&
            !selections.pendingGame &&
            !selections.pendingLocation &&
            navigationRef.isReady() &&
            isRestartSafeNavigation(navigationRef.getRootState()),
        );
      },
      change: setPhase,
      report: (error) => Sentry.captureException(error, { tags: { operation: "updates.manual" } }),
    });
    controller.current = current;
    const syncNavigation = () =>
      setNavigation(navigationRef.isReady() ? navigationRef.getRootState() : undefined);
    const stopNavigation = navigationRef.addListener("state", syncNavigation);
    const stopReady = navigationRef.addListener("ready", syncNavigation);
    syncNavigation();
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") current.background();
      setActive(state === "active");
    });
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      current.dispose();
      app.remove();
      show.remove();
      hide.remove();
      stopNavigation();
      stopReady();
    };
  }, [enabled, navigationRef, queryClient]);

  useEffect(() => {
    if (safe) void controller.current?.check();
  }, [safe]);

  if (!safe || phase === "idle" || phase === "checking") return null;
  const later = () => controller.current?.defer();
  return (
    <ConfirmDialog
      title={t("An update is available")}
      description={
        phase === "downloading"
          ? t("Downloading the update…")
          : phase === "restarting"
            ? t("Restarting the app…")
            : phase === "download-error"
              ? t("The update could not be downloaded. Try again or choose Later.")
              : phase === "restart-error"
                ? t("The app could not restart. Try again or choose Later.")
                : phase === "ready"
                  ? t("The update is downloaded. Restart when you are ready.")
                  : t("Update now, or choose Later to be reminded the next time you start the app.")
      }
      busy={phase === "downloading" || phase === "restarting"}
      blocksAppRestart={false}
      cancelLabel={t("Later")}
      cancelTestID="ota-update-close"
      onCancel={later}
      actions={[
        { label: t("Later"), variant: "ghost", onPress: later, testID: "ota-update-later" },
        {
          label: t("Update and restart"),
          variant: "primary",
          onPress: () => {
            void controller.current?.accept();
          },
          testID: "ota-update-accept",
        },
      ]}
    />
  );
}
