"use client";

import type { ProfileRatingHistory, ProfileRatingPoint } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { ListCard } from "@/components/common/ui/ListCard";
import { ProfileRatingChart } from "./ProfileRatingChart";
import { ProfileStats } from "./ProfileStats";

export function ProfileRatingSummary({
  data,
  points,
}: {
  data: Pick<ProfileRatingHistory, "rating" | "delta" | "stats">;
  points: ProfileRatingPoint[];
}) {
  const { t, i18n } = useLingui();
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  return (
    <>
      <ListCard>
        <div className="space-y-3 p-4">
          <p className="font-semibold">
            {t`Current rating`}: {data.rating === null ? t`Unknown` : number.format(data.rating)}
          </p>
          <p className="text-sm text-muted">
            {t`Last rated game change`}:{" "}
            {data.delta === null
              ? "—"
              : `${data.delta >= 0 ? "+" : ""}${number.format(data.delta)}`}
          </p>
          <ProfileRatingChart points={points} />
        </div>
      </ListCard>
      <ProfileStats
        items={[
          { label: t`Games played`, value: number.format(data.stats.gamesPlayed) },
          { label: t`Games won`, value: number.format(data.stats.gamesWon) },
        ]}
      />
    </>
  );
}
