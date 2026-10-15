import type { MatchVoteCounts } from "@board-game-organizer/schemas";

import { useLingui } from "@lingui/react/macro";

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
        - {counts.notChosen}
      </span>
    </span>
  );
}
