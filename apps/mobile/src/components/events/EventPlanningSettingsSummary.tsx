import type { ClientEventRecord } from "@board-game-organizer/shared";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function EventPlanningSettingsSummary({ event }: { event: ClientEventRecord }) {
  const t = useT();
  return (
    <View style={{ gap: 8 }}>
      <Typography className="text-foreground">
        <Typography className="font-semibold">
          {event.planningMode === "MANUAL" ? t("Manual") : t("Assisted")}
        </Typography>
        :{" "}
        {event.planningMode === "MANUAL"
          ? t("Managers arrange seats and the waiting list. Confirmation requirements still apply.")
          : t(
              "The app seeks compatible players, dates, locations and games. A manager must still confirm.",
            )}
      </Typography>
      <Typography className="text-foreground">
        <Typography className="font-semibold">
          {event.playerPreference === "BEST" ? t("BGG Best") : t("More players")}
        </Typography>
        :{" "}
        {event.playerPreference === "BEST"
          ? t("Prefers the player count marked Best on BGG.")
          : t("Prefers the solution that seats more people, respecting votes and constraints.")}
      </Typography>
      {event.playerPreference === "BEST" &&
      event.planningMode !== "MANUAL" &&
      event.allowBestReduction ? (
        <Typography className="text-foreground">
          {t("Assisted planning may seat fewer players to improve the BGG recommendation.")}
        </Typography>
      ) : null}
    </View>
  );
}
