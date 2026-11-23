"use client";

import type { ClientEventRecord } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";

export function EventPlanningSettingsSummary({ event }: { event: ClientEventRecord }) {
  const { t } = useLingui();
  return (
    <div className="space-y-2">
      <p>
        <strong>{event.planningMode === "MANUAL" ? t`Manual` : t`Assisted`}</strong>:{" "}
        {event.planningMode === "MANUAL"
          ? t`Managers arrange seats and the waiting list. Confirmation requirements still apply.`
          : t`The app seeks compatible players, dates, locations and games. A manager must still confirm.`}
      </p>
      <p>
        <strong>{event.playerPreference === "BEST" ? t`BGG Best` : t`More players`}</strong>:{" "}
        {event.playerPreference === "BEST"
          ? t`Prefers the player count marked Best on BGG.`
          : t`Prefers the solution that seats more people, respecting votes and constraints.`}
      </p>
      {event.playerPreference === "BEST" &&
      event.planningMode !== "MANUAL" &&
      event.allowBestReduction ? (
        <p>{t`Assisted planning may seat fewer players to improve the BGG recommendation.`}</p>
      ) : null}
    </div>
  );
}
