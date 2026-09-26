import type { MatchVoteCounts } from "@board-game-organizer/schemas";
import { Tooltip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleHelp } from "lucide-react";
import { useState } from "react";

export function VoteCounts({ counts }: { counts: MatchVoteCounts }) {
  const { t } = useLingui();
  return (
    <span
      role="img"
      aria-label={`${t`Yes`}: ${counts.yes}, ${t`No`}: ${counts.no}, ${t`If needed`}: ${counts.ifNeeded}, ${t`Not chosen`}: ${counts.notChosen}`}
      className="inline-flex shrink-0 gap-2 text-xs"
    >
      <span aria-hidden="true" className="text-success">
        ✓ {counts.yes}
      </span>
      <span aria-hidden="true" className="text-danger">
        × {counts.no}
      </span>
      <span aria-hidden="true" className="text-warning">
        ~ {counts.ifNeeded}
      </span>
      <span aria-hidden="true" className="text-default-500">
        ? {counts.notChosen}
      </span>
    </span>
  );
}

export function VoteLegend() {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  return (
    <Tooltip isOpen={open} delay={0}>
      <Tooltip.Trigger
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={t`Vote count legend`}
        className="inline-flex size-7 items-center justify-center rounded-full text-default-500 hover:text-foreground"
      >
        <CircleHelp aria-hidden="true" className="h-4 w-4" />
      </Tooltip.Trigger>
      <Tooltip.Content>
        <div className="flex flex-col gap-1 text-xs">
          <span className="text-success">✓ {t`Yes`}</span>
          <span className="text-danger">× {t`No`}</span>
          <span className="text-warning">~ {t`If needed`}</span>
          <span className="text-default-500">? {t`Not chosen`}</span>
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}
