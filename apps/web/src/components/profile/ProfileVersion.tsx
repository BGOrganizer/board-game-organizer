"use client";

import { appVersion } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { version } from "../../../package.json";

export function ProfileVersion() {
  const { t } = useLingui();
  const current = appVersion(
    version,
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT !== "production",
    process.env.NEXT_PUBLIC_BUILD_SHA,
  );
  return (
    <p className="text-center text-sm text-muted" data-testid="profile-version">
      {t`Version`}: {current}
    </p>
  );
}
