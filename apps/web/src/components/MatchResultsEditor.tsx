"use client";

import type { MatchDetailResponse, RegisterMatchResultsInput } from "@board-game-organizer/schemas";
import {
  normalizeMatchScore,
  previewMatchResults,
  type ScoreDraftRow,
} from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ContactConfirmDialog } from "./ContactConfirmDialog";
import { GroupedList, GroupedRow } from "./GroupedList";

function animate(update: () => void) {
  if (document.startViewTransition) document.startViewTransition(() => flushSync(update));
  else update();
}

export function MatchResultsEditor({
  data,
  busy,
  onBack,
  onSubmit,
}: {
  data: MatchDetailResponse;
  busy: boolean;
  onBack: () => void;
  onSubmit: (input: RegisterMatchResultsInput) => void;
}) {
  const { t } = useLingui();
  const players = [
    data.administrator,
    ...data.invitedPlayers.filter((p) => p.invitation.status === "ACCEPTED"),
  ];
  const names = new Map(players.map((player) => [player.id, player.name]));
  const [rows, setRows] = useState<ScoreDraftRow[]>(() =>
    players.map((player) => ({ userId: player.id, rawScore: "", notParticipated: false })),
  );
  const [lowerWins, setLowerWins] = useState(false);
  const [tieBreaks, setTieBreaks] = useState<RegisterMatchResultsInput["tieBreaks"]>([]);
  const [confirm, setConfirm] = useState(false);
  const preview = useMemo(
    () => previewMatchResults(rows, lowerWins, tieBreaks),
    [rows, lowerWins, tieBreaks],
  );
  useEffect(() => {
    if (tieBreaks.length !== preview.tieBreaks.length) setTieBreaks(preview.tieBreaks);
  }, [tieBreaks, preview.tieBreaks]);
  const groups = [
    ...new Set(
      preview.ranked.filter((row) => row.score !== null).map((row) => row.score as string),
    ),
  ];
  const updateRow = (id: string, change: Partial<ScoreDraftRow>) =>
    animate(() =>
      setRows((old) => old.map((row) => (row.userId === id ? { ...row, ...change } : row))),
    );
  const move = (score: string, index: number, direction: -1 | 1) => {
    const current = preview.tieBreaks.find((tie) => tie.score === score);
    if (!current) return;
    const order = [...current.orderedUserIds];
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    animate(() =>
      setTieBreaks((old) =>
        old.map((tie) => (tie.score === score ? { ...tie, orderedUserIds: order } : tie)),
      ),
    );
  };
  const submit = () => {
    if (!preview.valid || busy) return;
    onSubmit({ lowerWins, entries: preview.entries, tieBreaks: preview.tieBreaks });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-28">
      <Button variant="ghost" onPress={onBack}>
        <ArrowLeft className="h-4 w-4" />
        {t`Back to match`}
      </Button>
      <h1 className="text-xl font-semibold">{t`Register results`}</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-label={t`Player scores`} className="space-y-3">
          <h2 className="font-semibold">{t`Player scores`}</h2>
          <GroupedList>
            {players.map((player) => {
              const row = rows.find((item) => item.userId === player.id);
              if (!row) return null;
              return (
                <GroupedRow key={player.id} className="flex-wrap">
                  <span className="min-w-0 flex-1 font-medium">{player.name}</span>
                  <label className="flex items-center gap-1 text-sm">
                    <span>{t`Score`}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`${t`Score`}: ${player.name}`}
                      value={row.rawScore}
                      disabled={row.notParticipated || busy}
                      onChange={(event) => updateRow(player.id, { rawScore: event.target.value })}
                      aria-required={!row.notParticipated}
                      aria-invalid={
                        !row.notParticipated &&
                        row.rawScore !== "" &&
                        normalizeMatchScore(row.rawScore) === null
                      }
                      className="w-20 rounded-lg border border-default-300 bg-background px-2 py-2 text-foreground"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-checked={row.notParticipated}
                      aria-label={`${t`Did not participate`}: ${player.name}`}
                      checked={row.notParticipated}
                      disabled={busy}
                      onChange={(event) =>
                        updateRow(player.id, { notParticipated: event.target.checked })
                      }
                      className="h-5 w-5 accent-primary"
                    />
                    {t`Did not participate`}
                  </label>
                  {!row.notParticipated &&
                    row.rawScore !== "" &&
                    normalizeMatchScore(row.rawScore) === null && (
                      <span
                        role="alert"
                        className="w-full text-xs text-danger"
                      >{t`Enter a valid score`}</span>
                    )}
                </GroupedRow>
              );
            })}
          </GroupedList>
          <label className="flex items-center gap-2 rounded-xl bg-surface p-4">
            <input
              type="checkbox"
              role="switch"
              aria-checked={lowerWins}
              checked={lowerWins}
              disabled={busy}
              onChange={(event) => animate(() => setLowerWins(event.target.checked))}
              className="h-5 w-5 accent-primary"
            />
            {t`Lowest score wins`}
          </label>
        </section>
        <section aria-label={t`Live standings`} className="space-y-3">
          <h2 className="font-semibold">{t`Live standings`}</h2>
          {groups.map((score) => {
            const tied = preview.ranked.filter((entry) => entry.score === score);
            const active = preview.tieBreaks.some((tie) => tie.score === score);
            return (
              <div key={score} className="space-y-1">
                {tied.length > 1 && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {active ? t`Tie-break applied` : t`Tied score`}: {score}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={busy}
                      onPress={() =>
                        animate(() =>
                          setTieBreaks((old) =>
                            active
                              ? old.filter((tie) => tie.score !== score)
                              : [
                                  ...preview.tieBreaks,
                                  { score, orderedUserIds: tied.map((entry) => entry.userId) },
                                ],
                          ),
                        )
                      }
                    >
                      {active ? t`Remove tie-break` : t`Resolve tie`}
                    </Button>
                  </div>
                )}
                <GroupedList>
                  {tied.map((entry, index) => (
                    <GroupedRow
                      key={entry.userId}
                      className="gap-2"
                      style={{ viewTransitionName: `standing-${entry.userId}` }}
                    >
                      <span className="w-7 text-sm text-default-500">{entry.rank}.</span>
                      <span className="min-w-0 flex-1 truncate">{names.get(entry.userId)}</span>
                      <span className="font-medium">{entry.score}</span>
                      {active && (
                        <span className="flex gap-1">
                          <Button
                            size="sm"
                            isIconOnly
                            variant="ghost"
                            isDisabled={busy || index === 0}
                            aria-label={`${t`Move up`}: ${names.get(entry.userId)}`}
                            onPress={() => move(score, index, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            isIconOnly
                            variant="ghost"
                            isDisabled={busy || index === tied.length - 1}
                            aria-label={`${t`Move down`}: ${names.get(entry.userId)}`}
                            onPress={() => move(score, index, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </span>
                      )}
                    </GroupedRow>
                  ))}
                </GroupedList>
              </div>
            );
          })}
          {preview.ranked.some((entry) => entry.score === null) && (
            <GroupedList>
              {preview.ranked
                .filter((entry) => entry.score === null)
                .map((entry) => (
                  <GroupedRow key={entry.userId}>
                    <span className="flex-1">{names.get(entry.userId)}</span>
                    <span>ND</span>
                  </GroupedRow>
                ))}
            </GroupedList>
          )}
          {!preview.valid && (
            <p className="text-sm text-default-500">{t`Enter a score for each participant or mark them as not participating. At least one must participate.`}</p>
          )}
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-default-200 bg-background p-4 text-center">
        <Button
          isDisabled={!preview.valid || busy}
          onPress={() => setConfirm(true)}
        >{t`Register match`}</Button>
      </div>
      {confirm && (
        <ContactConfirmDialog
          title={t`Register match?`}
          description={t`Results and standings will become final and cannot be edited.`}
          busy={busy}
          onCancel={() => setConfirm(false)}
          actions={[{ label: t`Register match`, onPress: submit }]}
        />
      )}
    </div>
  );
}
