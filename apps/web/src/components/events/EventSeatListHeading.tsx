"use client";
import { useLingui } from "@lingui/react/macro";

export function EventSeatListHeading({ waiting }: { waiting: boolean }) {
  const { t } = useLingui();
  return <h2 className="font-semibold">{waiting ? t`Waiting list` : t`Seats list`}</h2>;
}
