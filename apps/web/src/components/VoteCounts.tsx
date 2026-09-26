import type { MatchVoteCounts } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";

export function VoteCounts({ counts }: { counts: MatchVoteCounts }) {
  const { t } = useLingui();
  return (
    <span
      role="img"
      aria-label={`${t`Yes`}: ${counts.yes}, ${t`No`}: ${counts.no}, ${t`If needed`}: ${counts.ifNeeded}, ${t`Not chosen`}: ${counts.notChosen}`}
      className="inline-flex shrink-0 gap-2 text-xs text-default-500"
    >
      <span aria-hidden="true">✓ {counts.yes}</span>
      <span aria-hidden="true">× {counts.no}</span>
      <span aria-hidden="true">~ {counts.ifNeeded}</span>
      <span aria-hidden="true">? {counts.notChosen}</span>
    </span>
  );
}

export function VoteLegend() {
  const { t } = useLingui();
  return (
    <p className="text-xs text-default-500">{`✓ ${t`Yes`} · × ${t`No`} · ~ ${t`If needed`} · ? ${t`Not chosen`}`}</p>
  );
}
