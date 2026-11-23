"use client";

import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Medal, Trophy } from "lucide-react";
import { IconBadge } from "./IconBadge";

export function RankPositionBadge({ rank }: { rank: number | null }) {
  const { t } = useLingui();
  const position = rank === null ? t`ND` : `#${rank}`;
  const label = `${t`Position`}: ${position}`;

  if (rank === 1) return <IconBadge icon={Trophy} color="warning" label={label} />;
  if (rank === 2) return <IconBadge icon={Medal} color="accent" label={label} />;
  if (rank === 3) return <IconBadge icon={Medal} label={label} />;

  return (
    <Chip
      role="img"
      aria-label={label}
      size="sm"
      color="default"
      variant="secondary"
      className="min-h-[22px] min-w-[22px] justify-center rounded-full px-1 tabular-nums"
    >
      {position}
    </Chip>
  );
}
