"use client";

import type { MatchDetailResponse, RegisterMatchResultsInput } from "@board-game-organizer/schemas";
import {
  normalizeMatchScore,
  previewMatchResults,
  type ScoreDraftRow,
} from "@board-game-organizer/shared";
import { Avatar, Button, Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ArrowLeft, ArrowUp, ListOrdered, Trophy, X } from "lucide-react";
import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ContactConfirmDialog } from "./ContactConfirmDialog";
import { GroupedList, GroupedRow } from "./GroupedList";

function animate(update: () => void) {
  if (document.startViewTransition) document.startViewTransition(() => flushSync(update));
  else update();
}

type Player = MatchDetailResponse["administrator"];

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
  const playerById = new Map(players.map((player) => [player.id, player]));
  const [rows, setRows] = useState<ScoreDraftRow[]>(() =>
    players.map((player) => ({ userId: player.id, rawScore: "0", notParticipated: false })),
  );
  const [lowerWins, setLowerWins] = useState(false);
  const [tieBreaks, setTieBreaks] = useState<RegisterMatchResultsInput["tieBreaks"]>([]);
  const [editingTie, setEditingTie] = useState<
    RegisterMatchResultsInput["tieBreaks"][number] | null
  >(null);
  const [scoreEditor, setScoreEditor] = useState<string | null>(null);
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
    if (!preview.valid || busy || editingTie) return;
    onSubmit({ lowerWins, entries: preview.entries, tieBreaks: preview.tieBreaks });
  };
  const identity = (player: Player) => (
    <>
      <Avatar size="sm" color="accent">
        <Avatar.Image src={player.avatarUrl ?? undefined} alt={player.name} />
        <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{player.name}</span>
        <span className="block truncate text-xs text-default-500">
          {player.email ?? t`Email unavailable`}
        </span>
      </span>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-28">
      <Button variant="ghost" onPress={onBack}>
        <ArrowLeft className="h-4 w-4" />
        {t`Back to match`}
      </Button>
      <h1 className="text-xl font-semibold">{t`Register results`}</h1>
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
                <div className="mx-4 flex items-center justify-between gap-3 text-sm">
                  <span>
                    {active ? t`Tie-break applied` : t`Tied score`}: {score}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {editing ? (
                      <>
                        <Button size="sm" variant="ghost" onPress={() => setEditingTie(null)}>
                          {t`Cancel`}
                        </Button>
                        <Button
                          size="sm"
                          isDisabled={busy}
                          onPress={() => {
                            setTieBreaks((old) => [
                              ...old.filter((tie) => tie.score !== score),
                              editingTie,
                            ]);
                            setEditingTie(null);
                          }}
                        >
                          {t`Confirm tie-break`}
                        </Button>
                      </>
                    ) : (
                      <>
                        {active && (
                          <Button
                            size="sm"
                            isIconOnly
                            variant="ghost"
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
                      <span className="w-7 text-sm text-default-500">{entry.rank}.</span>
                      {player && identity(player)}
                      <span className="font-medium">{entry.score}</span>
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
                    <span className="w-7 text-sm text-default-500">—</span>
                    {player && identity(player)}
                    <span>ND</span>
                  </GroupedRow>
                );
              })}
          </GroupedList>
        )}
        {!preview.valid && (
          <p className="text-sm text-default-500">{t`Enter a score for each participant or mark them as not participating. At least one must participate.`}</p>
        )}
      </section>
      <section aria-label={t`Player scores`} className="space-y-3">
        <h2 className="font-semibold">{t`Player scores`}</h2>
        <GroupedList>
          {players.map((player) => {
            const row = rows.find((item) => item.userId === player.id);
            if (!row) return null;
            return (
              <GroupedRow key={player.id} className="gap-2">
                {identity(player)}
                <Popover
                  isOpen={scoreEditor === player.id}
                  onOpenChange={(open) => setScoreEditor(open ? player.id : null)}
                >
                  <Button
                    size="sm"
                    isIconOnly
                    variant="primary"
                    isDisabled={busy}
                    aria-label={`${t`Score`}: ${player.name}`}
                  >
                    <Trophy className="h-4 w-4" />
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
                          onPress={() => setScoreEditor(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <label className="block text-sm">
                        <span className="mb-1 block">{t`Score`}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`${t`Score`}: ${player.name}`}
                          value={row.rawScore}
                          disabled={row.notParticipated || busy}
                          onChange={(event) =>
                            updateRow(player.id, { rawScore: event.target.value })
                          }
                          aria-required={!row.notParticipated}
                          aria-invalid={
                            !row.notParticipated &&
                            row.rawScore !== "" &&
                            normalizeMatchScore(row.rawScore) === null
                          }
                          className="w-full rounded-lg border border-default-300 bg-background px-2 py-2 text-foreground"
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
                          <span role="alert" className="text-xs text-danger">
                            {t`Enter a valid score`}
                          </span>
                        )}
                    </Popover.Dialog>
                  </Popover.Content>
                </Popover>
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
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              animate(() => setLowerWins(checked));
            }}
            className="h-5 w-5 accent-primary"
          />
          {t`Lowest score wins`}
        </label>
      </section>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-default-200 bg-background p-4 text-center">
        <Button
          isDisabled={!preview.valid || busy || Boolean(editingTie)}
          onPress={() => setConfirm(true)}
        >
          {t`Register match`}
        </Button>
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
