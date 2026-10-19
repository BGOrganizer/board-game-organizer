import {
  normalizeMatchScore,
  previewTableResults,
  type ScoreDraftRow,
  type ScorePlayer,
  type TableScoreInput,
} from "@board-game-organizer/shared";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { useBottomSheetAwareHandlers, useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { ArrowDown, ArrowUp, Check, ListOrdered, Pencil, Undo2, X } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Platform, View } from "react-native";
import Animated, { LinearTransition, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScoreIdentity } from "@/components/ratings/ScoreIdentity";
import { useT } from "@/lib/i18n";

const transition = LinearTransition.duration(220).reduceMotion(ReduceMotion.System);
function ScoreInput({
  name,
  row,
  onChange,
}: {
  name: string;
  row: ScoreDraftRow;
  onChange: (score: string) => void;
}) {
  const t = useT(),
    { onFocus, onBlur } = useBottomSheetAwareHandlers();
  return (
    <View style={{ gap: 8, flex: 1 }}>
      <Typography className="text-foreground">{t("Score")}</Typography>
      <Input
        accessibilityLabel={`${t("Score")}: ${name}`}
        keyboardType={Platform.OS === "android" ? "numeric" : "numbers-and-punctuation"}
        editable={!row.notParticipated}
        value={row.rawScore}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {!row.notParticipated && row.rawScore !== "" && normalizeMatchScore(row.rawScore) === null ? (
        <Typography className="text-danger">{t("Enter a valid score")}</Typography>
      ) : null}
    </View>
  );
}
export function TableScoreEditor({
  players,
  initial,
  busy,
  onBack,
  onSubmit,
}: {
  players: ScorePlayer[];
  initial?: TableScoreInput;
  busy: boolean;
  onBack: () => void;
  onSubmit: (input: TableScoreInput) => void;
}) {
  const t = useT(),
    insets = useSafeAreaInsets(),
    fg = useThemeColor("foreground"),
    accent = useThemeColor("accent-foreground"),
    [rows, setRows] = useState<ScoreDraftRow[]>(() =>
      players.map((p) => {
        const prior = initial?.entries.find((row) => row.userId === p.id);
        return {
          userId: p.id,
          rawScore: prior?.score ?? "",
          notParticipated: prior?.score === null,
        };
      }),
    ),
    [lowerWins, setLowerWins] = useState(initial?.lowerWins ?? false),
    [ties, setTies] = useState<TableScoreInput["tieBreaks"]>(initial?.tieBreaks ?? []),
    [editing, setEditing] = useState<TableScoreInput["tieBreaks"][number] | null>(null),
    [scoreId, setScoreId] = useState<string | null>(null);
  const preview = previewTableResults(
      rows,
      lowerWins,
      editing ? [...ties.filter((tie) => tie.score !== editing.score), editing] : ties,
    ),
    ordered = [
      ...preview.ranked.map((row) => row.userId),
      ...players
        .filter((player) => !preview.ranked.some((row) => row.userId === player.id))
        .map((player) => player.id),
    ],
    active = players.find((p) => p.id === scoreId),
    activeRow = rows.find((row) => row.userId === scoreId);
  const update = (id: string, value: Partial<ScoreDraftRow>) => {
    setEditing(null);
    setRows((old) => old.map((row) => (row.userId === id ? { ...row, ...value } : row)));
  };
  const move = (id: string, direction: -1 | 1) => {
    if (!editing) return;
    const values = [...editing.orderedUserIds],
      index = values.indexOf(id);
    if (index + direction < 0 || index + direction >= values.length) return;
    [values[index], values[index + direction]] = [values[index + direction], values[index]];
    setEditing({ ...editing, orderedUserIds: values });
  };
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={ordered}
        keyExtractor={(id) => id}
        contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Button variant="ghost" isDisabled={busy} onPress={onBack}>
              <Button.Label>{t("Back to table")}</Button.Label>
            </Button>
            <Typography className="font-semibold text-foreground">{t("Live standings")}</Typography>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {t("Lowest score wins")}
              </Typography>
              <Switch
                accessibilityLabel={t("Lowest score wins")}
                isSelected={lowerWins}
                onSelectedChange={setLowerWins}
                isDisabled={busy}
              >
                <Switch.Thumb />
              </Switch>
            </View>
          </View>
        }
        renderItem={({ item: id, index }) => {
          const player = players.find((p) => p.id === id)!,
            entry = preview.ranked.find((row) => row.userId === id),
            score = entry?.score,
            tied =
              score !== undefined && score !== null
                ? preview.ranked.filter((row) => row.score === score)
                : [],
            first = tied.length > 1 && tied[0].userId === id;
          return (
            <View style={{ gap: 8 }}>
              {first ? (
                <View
                  style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                >
                  <Typography className="text-foreground" style={{ flex: 1 }}>
                    {t("Tied score")}: {score}
                  </Typography>
                  {editing?.score === score ? (
                    <>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={t("Cancel tie-break")}
                        onPress={() => setEditing(null)}
                      >
                        <Undo2 size={18} color={fg} />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        accessibilityLabel={t("Confirm tie-break")}
                        onPress={() => {
                          if (!editing) return;
                          const chosen = editing;
                          setTies((old) => [...old.filter((row) => row.score !== score), chosen]);
                          setEditing(null);
                        }}
                      >
                        <Check size={18} color={accent} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        isIconOnly
                        size="sm"
                        accessibilityLabel={t("Resolve tie")}
                        isDisabled={busy}
                        onPress={() =>
                          setEditing({
                            score: score!,
                            orderedUserIds: tied.map((row) => row.userId),
                          })
                        }
                      >
                        <ListOrdered size={18} color={accent} />
                      </Button>
                      {ties.some((tie) => tie.score === score) ? (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="danger-soft"
                          accessibilityLabel={t("Remove tie-break")}
                          onPress={() => setTies((old) => old.filter((tie) => tie.score !== score))}
                        >
                          <X size={18} color={fg} />
                        </Button>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
              <Animated.View
                layout={transition}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12 }}
                className="rounded-xl bg-surface"
              >
                <ScoreIdentity player={player} rank={entry?.rank} />
                <Typography className="text-foreground">
                  {entry?.score ??
                    (rows.find((row) => row.userId === id)?.notParticipated ? t("ND") : "—")}
                </Typography>
                {editing && score === editing.score ? (
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      accessibilityLabel={`${t("Move up")}: ${player.name}`}
                      isDisabled={editing.orderedUserIds.indexOf(id) === 0}
                      onPress={() => move(id, -1)}
                    >
                      <ArrowUp size={18} color={fg} />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      accessibilityLabel={`${t("Move down")}: ${player.name}`}
                      isDisabled={
                        editing.orderedUserIds.indexOf(id) === editing.orderedUserIds.length - 1
                      }
                      onPress={() => move(id, 1)}
                    >
                      <ArrowDown size={18} color={fg} />
                    </Button>
                  </View>
                ) : null}
                <Button
                  isIconOnly
                  size="sm"
                  accessibilityLabel={`${t("Score")}: ${player.name}`}
                  isDisabled={busy}
                  onPress={() => setScoreId(id)}
                >
                  <Pencil size={18} color={accent} />
                </Button>
              </Animated.View>
            </View>
          );
        }}
        ListFooterComponent={
          !preview.valid ? (
            <Typography className="text-muted">
              {t(
                "Enter a score for every frozen player or mark them as not participating. An all-ND table changes no ratings or statistics.",
              )}
            </Typography>
          ) : null
        }
      />
      <View style={{ padding: 16, paddingBottom: insets.bottom + 16 }}>
        <Button
          isDisabled={!preview.valid || busy || Boolean(editing) || Boolean(scoreId)}
          onPress={() =>
            onSubmit({ lowerWins, entries: preview.entries, tieBreaks: preview.tieBreaks })
          }
        >
          <Button.Label>{t("Use table scores")}</Button.Label>
        </Button>
      </View>
      <BottomSheet
        isOpen={scoreId !== null}
        onOpenChange={(open) => {
          if (!open) setScoreId(null);
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content keyboardBehavior="extend">
            <BottomSheet.Title>{active?.name ?? t("Score")}</BottomSheet.Title>
            {active && activeRow ? (
              <>
                <View
                  style={{ flexDirection: "row", gap: 12, alignItems: "center", marginTop: 16 }}
                >
                  <ScoreInput
                    name={active.name}
                    row={activeRow}
                    onChange={(rawScore) => update(active.id, { rawScore })}
                  />
                  <View style={{ width: 110, gap: 8 }}>
                    <Typography className="text-muted">{t("Did not participate")}</Typography>
                    <Switch
                      accessibilityLabel={`${t("Did not participate")}: ${active.name}`}
                      isSelected={activeRow.notParticipated}
                      onSelectedChange={(notParticipated) => update(active.id, { notParticipated })}
                    >
                      <Switch.Thumb />
                    </Switch>
                  </View>
                </View>
                <Button
                  variant="secondary"
                  style={{ marginTop: 24 }}
                  onPress={() => setScoreId(null)}
                >
                  <Button.Label>{t("Done")}</Button.Label>
                </Button>
              </>
            ) : null}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </View>
  );
}
