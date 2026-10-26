"use client";

import type {
  TableScoreInput as RegisterMatchResultsInput,
  ScorePlayer,
} from "@board-game-organizer/shared";
import {
  normalizeMatchScore,
  previewTableResults as previewMatchResults,
  type ScoreDraftRow,
} from "@board-game-organizer/shared";
import { Button, Input, Popover, Switch } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ArrowUp, Check, ListOrdered, Pencil, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ContactConfirmDialog } from "../common/ui/ContactConfirmDialog";
import { GroupedList } from "../common/ui/GroupedList";
import { GroupedRow } from "../common/ui/GroupedRow";
import { ScoreIdentity as MatchStandingIdentity } from "../ratings/ScoreIdentity";

function animate(update: () => void) {
  if (document.startViewTransition) document.startViewTransition(() => flushSync(update));
  else update();
}

export function TableScoreEditor({
  players,
  initial,
  busy,
  onSubmit,
}: {
  players: ScorePlayer[];
  initial?: RegisterMatchResultsInput;
  busy: boolean;
  onSubmit: (input: RegisterMatchResultsInput) => void;
}) {
  const { t } = useLingui();
  const playerById = new Map(players.map((player) => [player.id, player]));
  const [rows, setRows] = useState<ScoreDraftRow[]>(() =>
    players.map((player) => {
      const previous = initial?.entries.find((row) => row.userId === player.id);
      return {
        userId: player.id,
        rawScore: previous?.score ?? "",
        notParticipated: previous?.score === null,
      };
    }),
  );
  const [lowerWins, setLowerWins] = useState(initial?.lowerWins ?? false);
  const [tieBreaks, setTieBreaks] = useState<RegisterMatchResultsInput["tieBreaks"]>(
    initial?.tieBreaks ?? [],
  );
  const [editingTie, setEditingTie] = useState<
    RegisterMatchResultsInput["tieBreaks"][number] | null
  >(null);
  const [scoreEditor, setScoreEditor] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState({ rawScore: "", notParticipated: false });
  const [confirm, setConfirm] = useState(false);
  const preview = useMemo(
    () =>
      previewMatchResults(
        rows,
        lowerWins,
        editingTie
          ? [...tieBreaks.filter((tie) => tie.score !== editingTie.score), editingTie]
          : tieBreaks,
      ),
    [rows, lowerWins, tieBreaks, editingTie],
  );
  const groups = [
    ...new Set(
      preview.ranked.filter((row) => row.score !== null).map((row) => row.score as string),
    ),
  ];
  const updateRow = (id: string, change: Partial<ScoreDraftRow>) => {
    setEditingTie(null);
    animate(() =>
      setRows((old) => old.map((row) => (row.userId === id ? { ...row, ...change } : row))),
    );
  };
  const move = (index: number, direction: -1 | 1) => {
    if (!editingTie) return;
    const order = [...editingTie.orderedUserIds];
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    animate(() => setEditingTie({ ...editingTie, orderedUserIds: order }));
  };
  const submit = () => {
    if (!preview.valid || busy || editingTie || scoreEditor) return;
    onSubmit({ lowerWins, entries: preview.entries, tieBreaks: preview.tieBreaks });
  };
  const closeScore = (id: string) => {
    setScoreEditor(null);
    const rawScore = scoreDraft.rawScore;
    const previous = rows.find((row) => row.userId === id);
    if (
      previous &&
      (previous.rawScore !== rawScore || previous.notParticipated !== scoreDraft.notParticipated)
    )
      updateRow(id, { rawScore, notParticipated: scoreDraft.notParticipated });
  };
  const scoreButton = (player: ScorePlayer) => {
    const row = rows.find((item) => item.userId === player.id);
    if (!row) return null;
    return (
      <Popover
        isOpen={scoreEditor === player.id}
        onOpenChange={(open) => {
          if (open) {
            setScoreDraft({ rawScore: row.rawScore, notParticipated: row.notParticipated });
            setScoreEditor(player.id);
          } else if (scoreEditor === player.id) closeScore(player.id);
        }}
      >
        <Button
          size="sm"
          isIconOnly
          variant="primary"
          isDisabled={busy}
          aria-label={`${t`Score`}: ${player.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Popover.Content placement="bottom end" className="w-64">
          <Popover.Dialog className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <Popover.Heading>{player.name}</Popover.Heading>
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                aria-label={t`Close`}
                onPress={() => closeScore(player.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <label className="block text-sm" htmlFor={`score-${player.id}`}>
              <span className="mb-1 block">{t`Score`}</span>
              <Input
                id={`score-${player.id}`}
                type="text"
                inputMode="decimal"
                aria-label={`${t`Score`}: ${player.name}`}
                value={scoreDraft.rawScore}
                disabled={scoreDraft.notParticipated || busy}
                onChange={(event) =>
                  setScoreDraft((old) => ({ ...old, rawScore: event.target.value }))
                }
                aria-required={!scoreDraft.notParticipated}
                aria-invalid={
                  !scoreDraft.notParticipated &&
                  scoreDraft.rawScore !== "" &&
                  normalizeMatchScore(scoreDraft.rawScore) === null
                }
                className="w-full rounded-lg border border-default-300 bg-background px-2 py-2 text-foreground"
              />
            </label>
            <Switch
              isSelected={scoreDraft.notParticipated}
              isDisabled={busy}
              aria-label={`${t`Did not participate`}: ${player.name}`}
              onChange={(notParticipated) => setScoreDraft((old) => ({ ...old, notParticipated }))}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                {t`Did not participate`}
              </Switch.Content>
            </Switch>
            {!scoreDraft.notParticipated &&
              scoreDraft.rawScore !== "" &&
              normalizeMatchScore(scoreDraft.rawScore) === null && (
                <span role="alert" className="text-xs text-danger">{t`Enter a valid score`}</span>
              )}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    );
  };
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-28">
      <section
        aria-label={t`Live standings`}
        className="space-y-3 overflow-y-auto"
        style={{ height: Math.min(360, players.length * 72 + 72) }}
      >
        <h2 className="font-semibold">{t`Live standings`}</h2>
        {groups.map((score) => {
          const tied = preview.ranked.filter((entry) => entry.score === score);
          const editing = editingTie?.score === score;
          const active = tieBreaks.some((tie) => tie.score === score);
          return (
            <div key={score} className="space-y-1">
              {tied.length > 1 && (
                <div className="mx-4 mt-4 flex items-center justify-between gap-3 text-sm">
                  <span>
                    {active ? t`Tie-break applied` : t`Tied score`}: {score}
                  </span>
                  <span className="flex w-20 shrink-0 items-center justify-end gap-2">
                    {editing ? (
                      <>
                        <Button
                          size="sm"
                          isIconOnly
                          variant="outline"
                          aria-label={t`Cancel`}
                          onPress={() => setEditingTie(null)}
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          isIconOnly
                          variant="primary"
                          aria-label={t`Confirm tie-break`}
                          isDisabled={busy}
                          onPress={() => {
                            setTieBreaks((old) => [
                              ...old.filter((tie) => tie.score !== score),
                              editingTie,
                            ]);
                            setEditingTie(null);
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        {active && (
                          <Button
                            size="sm"
                            isIconOnly
                            variant="danger-soft"
                            isDisabled={busy}
                            aria-label={t`Remove tie-break`}
                            onPress={() =>
                              animate(() =>
                                setTieBreaks((old) => old.filter((tie) => tie.score !== score)),
                              )
                            }
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          isIconOnly
                          variant="primary"
                          isDisabled={busy}
                          aria-label={active ? t`Edit tie-break` : t`Resolve tie`}
                          onPress={() =>
                            setEditingTie({
                              score,
                              orderedUserIds:
                                preview.tieBreaks.find((tie) => tie.score === score)
                                  ?.orderedUserIds ?? tied.map((entry) => entry.userId),
                            })
                          }
                        >
                          <ListOrdered className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </span>
                </div>
              )}
              <GroupedList>
                {tied.map((entry, index) => {
                  const player = playerById.get(entry.userId);
                  return (
                    <GroupedRow
                      key={entry.userId}
                      className="gap-2"
                      style={{ viewTransitionName: `standing-${entry.userId}` }}
                    >
                      {player && <MatchStandingIdentity player={player} rank={entry.rank} />}
                      <span className="font-medium">{entry.score}</span>
                      {player && scoreButton(player)}
                      {editing && (
                        <span className="flex gap-1">
                          <Button
                            size="sm"
                            isIconOnly
                            variant="ghost"
                            isDisabled={busy || index === 0}
                            aria-label={`${t`Move up`}: ${player?.name}`}
                            onPress={() => move(index, -1)}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            isIconOnly
                            variant="ghost"
                            isDisabled={busy || index === tied.length - 1}
                            aria-label={`${t`Move down`}: ${player?.name}`}
                            onPress={() => move(index, 1)}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </span>
                      )}
                    </GroupedRow>
                  );
                })}
              </GroupedList>
            </div>
          );
        })}
        {preview.ranked.some((entry) => entry.score === null) && (
          <GroupedList>
            {preview.ranked
              .filter((entry) => entry.score === null)
              .map((entry) => {
                const player = playerById.get(entry.userId);
                return (
                  <GroupedRow key={entry.userId} className="gap-2">
                    {player && <MatchStandingIdentity player={player} />}
                    <span>ND</span>
                    {player && scoreButton(player)}
                  </GroupedRow>
                );
              })}
          </GroupedList>
        )}
        {rows.some((row) => !row.notParticipated && normalizeMatchScore(row.rawScore) === null) && (
          <GroupedList>
            {rows
              .filter((row) => !row.notParticipated && normalizeMatchScore(row.rawScore) === null)
              .map((row) => {
                const player = playerById.get(row.userId);
                return (
                  <GroupedRow key={row.userId} className="gap-2">
                    {player && <MatchStandingIdentity player={player} />}
                    <span>-</span>
                    {player && scoreButton(player)}
                  </GroupedRow>
                );
              })}
          </GroupedList>
        )}
        {!preview.valid && (
          <p className="text-sm text-default-500">{t`Enter a score for every frozen player or mark them as not participating. An all-ND table changes no ratings or statistics.`}</p>
        )}
      </section>
      <Switch
        isSelected={lowerWins}
        isDisabled={busy}
        onChange={(value) => animate(() => setLowerWins(value))}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {t`Lowest score wins`}
        </Switch.Content>
      </Switch>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-default-200 bg-background p-4 text-center">
        <Button
          isDisabled={!preview.valid || busy || Boolean(editingTie) || Boolean(scoreEditor)}
          onPress={() => setConfirm(true)}
        >
          {t`Use table scores`}
        </Button>
      </div>
      {confirm && (
        <ContactConfirmDialog
          title={t`Use table scores?`}
          description={t`These are draft scores. Nothing is saved until you finalize the whole event.`}
          busy={busy}
          onCancel={() => setConfirm(false)}
          actions={[{ label: t`Use table scores`, onPress: submit }]}
        />
      )}
    </div>
  );
}
