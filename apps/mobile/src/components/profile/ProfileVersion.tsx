import { appVersion } from "@board-game-organizer/shared";
import Constants from "expo-constants";
import { Typography } from "heroui-native/text";
import { useT } from "@/lib/i18n";
import { version } from "../../../package.json";

export function ProfileVersion() {
  const t = useT();
  const prerelease =
    process.env.EXPO_PUBLIC_APP_PRERELEASE === undefined
      ? Constants.expoConfig?.extra?.sentryEnvironment !== "production"
      : process.env.EXPO_PUBLIC_APP_PRERELEASE === "true";
  const current = appVersion(version, prerelease, process.env.EXPO_PUBLIC_BUILD_SHA);
  return (
    <Typography className="text-center text-sm text-muted" testID="profile-version">
      {t("Version")}: {current}
    </Typography>
  );
}
