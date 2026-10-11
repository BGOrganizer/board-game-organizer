"use client";

import { useLingui } from "@lingui/react/macro";

export function MatchPlayerLimits({
  minPlayers,
  maxPlayers,
}: {
  minPlayers: number;
  maxPlayers: number;
}) {
  const { t } = useLingui();
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <p className="text-default-500">{t`Minimum players`}</p>
        <p className="font-semibold">{minPlayers}</p>
      </div>
      <div>
        <p className="text-default-500">{t`Maximum players`}</p>
        <p className="font-semibold">{maxPlayers}</p>
      </div>
    </div>
  );
}
