import type { MatchDetailResponse, RegisterMatchResultsInput } from "@board-game-organizer/schemas";
import {
  normalizeMatchScore,
  previewMatchResults,
  resolveApiUrl,
  type ScoreDraftRow,
  useMatchDetail,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { Button } from "heroui-native/button";
import { useBottomSheetAwareHandlers, useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { ArrowDown, ArrowUp, ListOrdered, Trophy, X } from "lucide-react-native";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import Animated, { LinearTransition, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const rowTransition = LinearTransition.duration(220).reduceMotion(ReduceMotion.System);
type Player = MatchDetailResponse["administrator"];

export default function MatchResultsScreen() {
  const t = useT();
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const feedback = useMutationFeedback();
  const [draftData, setDraftData] = useState<MatchDetailResponse | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((value) => {
        if (active) setToken(value ?? null);
      })
      .catch(() => {
        if (active) setToken(null);
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn]);
  const matches = useMatchDetail({
    apiUrl: resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined),
    token,
    getToken,
    userId,
    matchId: matchId ?? "",
    feedback,
  });
  const data = matches.detail.data;
  useEffect(() => {
    if (
      data?.match.id === matchId &&
      data.match.status === "CREATED" &&
      data.match.adminUserId === userId &&
      draftData?.match.id !== matchId
    ) {
      setDraftData(data);
    }
  }, [data, draftData, matchId, userId]);
  // Keep the unsaved form mounted while the optimistic status change is pending.
  const editorData = draftData?.match.id === matchId ? draftData : data;
  if (matches.detail.isPending && !editorData)
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Stack.Screen options={{ title: t("Register results") }} />
        <Skeleton isLoading style={{ width: "100%", height: 90, borderRadius: 12 }} />
        <Skeleton isLoading style={{ width: "100%", height: 240, borderRadius: 12 }} />
      </View>
    );
  if ((matches.detail.isError || !data) && !editorData)
    return (
      <View style={{ padding: 20 }}>
        <Stack.Screen options={{ title: t("Register results") }} />
        <Typography className="text-danger">{t("Could not load match details")}</Typography>
      </View>
    );
  if (
    !editorData ||
    editorData.match.adminUserId !== userId ||
    editorData.match.status !== "CREATED"
  )
    return (
      <View style={{ padding: 20 }}>
        <Stack.Screen options={{ title: t("Register results") }} />
        <Typography className="text-danger">
          {t("Results can only be registered by the match administrator before termination.")}
        </Typography>
      </View>
    );
  return (
    <ResultsForm
      key={matchId}
      data={editorData}
      busy={matches.registerResults.isPending}
      onSubmit={(input) =>
        matches.registerResults.mutate(input, {
          onSuccess: () =>
            router.replace({ pathname: "/match/[matchId]", params: { matchId, tab: "standings" } }),
        })
      }
    />
  );
}

function PlayerInfo({ player }: { player: Player }) {
  const t = useT();
  return (
    <>
      <Avatar size="md">
        {player.avatarUrl && <Avatar.Image source={{ uri: player.avatarUrl }} />}
        <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
      </Avatar>
      <View style={{ flex: 1, gap: 2 }}>
        <Typography className="font-medium text-foreground" numberOfLines={1}>
          {player.name}
        </Typography>
        <Typography className="text-xs text-muted" numberOfLines={1}>
          {player.email ?? t("Email unavailable")}
        </Typography>
      </View>
    </>
  );
}

// BottomSheet portal renders outside I18nProvider; translate labels in ResultsForm.
function ScoreSheetInput({
  player,
  row,
  busy,
  onChange,
  scoreLabel,
  invalidScoreLabel,
}: {
  player: Player;
  row: ScoreDraftRow;
  busy: boolean;
  onChange: (value: string) => void;
  scoreLabel: string;
  invalidScoreLabel: string;
}) {
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  return (
    <View style={{ gap: 6, marginTop: 12 }}>
      <Typography className="text-foreground">{scoreLabel}</Typography>
      <Input
        value={row.rawScore}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        accessibilityLabel={`${scoreLabel}: ${player.name}`}
        placeholder={scoreLabel}
        keyboardType={Platform.OS === "android" ? "numeric" : "numbers-and-punctuation"}
        editable={!row.notParticipated && !busy}
        className="text-foreground"
        aria-invalid={
          !row.notParticipated && row.rawScore !== "" && normalizeMatchScore(row.rawScore) === null
        }
        testID={`score-${player.id}`}
      />
      {!row.notParticipated &&
        row.rawScore !== "" &&
        normalizeMatchScore(row.rawScore) === null && (
          <Typography className="text-xs text-danger">{invalidScoreLabel}</Typography>
        )}
    </View>
  );
}

function ResultsForm({
  data,
  busy,
  onSubmit,
}: {
  data: MatchDetailResponse;
  busy: boolean;
  onSubmit: (input: RegisterMatchResultsInput) => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const accentForeground = useThemeColor("accent-foreground");
  const players = [
    data.administrator,
    ...data.invitedPlayers.filter((player) => player.invitation.status === "ACCEPTED"),
  ];
  const playerById = new Map(players.map((player) => [player.id, player]));
  const [rows, setRows] = useState<ScoreDraftRow[]>(() =>
    players.map((player) => ({ userId: player.id, rawScore: "0", notParticipated: false })),
  );
  const [scorePlayerId, setScorePlayerId] = useState<string | null>(null);
  const [lowerWins, setLowerWins] = useState(false);
  const [tieBreaks, setTieBreaks] = useState<RegisterMatchResultsInput["tieBreaks"]>([]);
  const [editingTie, setEditingTie] = useState<
    RegisterMatchResultsInput["tieBreaks"][number] | null
  >(null);
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
  const update = (id: string, change: Partial<ScoreDraftRow>) => {
    setEditingTie(null);
    setRows((old) => old.map((row) => (row.userId === id ? { ...row, ...change } : row)));
  };
  const activePlayer = players.find((player) => player.id === scorePlayerId);
  const activeRow = rows.find((row) => row.userId === scorePlayerId);
  const move = (index: number, direction: -1 | 1) => {
    if (!editingTie) return;
    const order = [...editingTie.orderedUserIds];
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    setEditingTie({ ...editingTie, orderedUserIds: order });
  };
  const confirm = () => {
    if (!preview.valid || busy || editingTie) return;
    Alert.alert(
      t("Register match?"),
      t("Results and standings will become final and cannot be edited."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Register match"),
          onPress: () =>
            onSubmit({ lowerWins, entries: preview.entries, tieBreaks: preview.tieBreaks }),
        },
      ],
    );
  };
  return (
    <View style={{ flex: 1 }} className="bg-background">
      <Stack.Screen options={{ title: t("Register results") }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 16 }}
      >
        <Typography className="font-semibold text-foreground">{t("Live standings")}</Typography>
        <ScrollView
          nestedScrollEnabled
          style={{ height: Math.min(360, players.length * 72 + 72) }}
          contentContainerStyle={{ gap: 6 }}
          className="rounded-xl bg-surface"
        >
          {groups.map((score) => {
            const tied = preview.ranked.filter((entry) => entry.score === score);
            const editing = editingTie?.score === score;
            const active = tieBreaks.some((tie) => tie.score === score);
            return (
              <Fragment key={score}>
                {tied.length > 1 && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginHorizontal: 16,
                    }}
                  >
                    <Typography className="flex-1 text-sm text-foreground">
                      {active ? t("Tie-break applied") : t("Tied score")}: {score}
                    </Typography>
                    {editing ? (
                      <>
                        <Button size="sm" variant="ghost" onPress={() => setEditingTie(null)}>
                          {t("Cancel")}
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
                          {t("Confirm tie-break")}
                        </Button>
                      </>
                    ) : (
                      <>
                        {active && (
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            accessibilityLabel={t("Remove tie-break")}
                            isDisabled={busy}
                            onPress={() =>
                              setTieBreaks((old) => old.filter((tie) => tie.score !== score))
                            }
                          >
                            <X size={18} color="#737373" />
                          </Button>
                        )}
                        <Button
                          isIconOnly
                          size="sm"
                          variant="primary"
                          accessibilityLabel={active ? t("Edit tie-break") : t("Resolve tie")}
                          testID={`resolve-tie-${score}`}
                          isDisabled={busy}
                          onPress={() =>
                            setEditingTie({
                              score,
                              orderedUserIds:
                                preview.tieBreaks.find((tie) => tie.score === score)
                                  ?.orderedUserIds ?? tied.map((entry) => entry.userId),
                            })
                          }
                        >
                          <ListOrdered size={18} color={accentForeground} />
                        </Button>
                      </>
                    )}
                  </View>
                )}
                {tied.map((entry, index) => {
                  const player = playerById.get(entry.userId);
                  return (
                    <Animated.View
                      key={entry.userId}
                      layout={rowTransition}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        minHeight: 56,
                        padding: 10,
                      }}
                    >
                      <Typography className="text-sm text-muted">{entry.rank}.</Typography>
                      {player && <PlayerInfo player={player} />}
                      <Typography className="font-semibold text-foreground">
                        {entry.score}
                      </Typography>
                      {editing && (
                        <View style={{ flexDirection: "row" }}>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            isDisabled={busy || index === 0}
                            style={{ minHeight: 44, minWidth: 44 }}
                            accessibilityLabel={`${t("Move up")}: ${player?.name}`}
                            onPress={() => move(index, -1)}
                          >
                            <ArrowUp size={18} color="#737373" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            isDisabled={busy || index === tied.length - 1}
                            style={{ minHeight: 44, minWidth: 44 }}
                            accessibilityLabel={`${t("Move down")}: ${player?.name}`}
                            onPress={() => move(index, 1)}
                          >
                            <ArrowDown size={18} color="#737373" />
                          </Button>
                        </View>
                      )}
                    </Animated.View>
                  );
                })}
              </Fragment>
            );
          })}
          {preview.ranked
            .filter((entry) => entry.score === null)
            .map((entry) => {
              const player = playerById.get(entry.userId);
              return (
                <Animated.View
                  key={entry.userId}
                  layout={rowTransition}
                  style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}
                >
                  <Typography className="text-sm text-muted">—</Typography>
                  {player && <PlayerInfo player={player} />}
                  <Typography className="text-foreground">ND</Typography>
                </Animated.View>
              );
            })}
        </ScrollView>
        <Typography className="font-semibold text-foreground">{t("Player scores")}</Typography>
        <GroupedList>
          {players.map((player) => (
            <GroupedRow key={player.id}>
              <PlayerInfo player={player} />
              <Button
                isIconOnly
                size="sm"
                variant="primary"
                isDisabled={busy}
                accessibilityLabel={`${t("Score")}: ${player.name}`}
                testID={`edit-score-${player.id}`}
                style={{ minHeight: 44, minWidth: 44 }}
                onPress={() => setScorePlayerId(player.id)}
              >
                <Trophy size={18} color={accentForeground} />
              </Button>
            </GroupedRow>
          ))}
        </GroupedList>
        {!preview.valid && (
          <Typography className="text-sm text-muted">
            {t(
              "Enter a score for each participant or mark them as not participating. At least one must participate.",
            )}
          </Typography>
        )}
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}
          className="rounded-xl bg-surface"
        >
          <Typography className="flex-1 text-foreground">{t("Lowest score wins")}</Typography>
          <Switch
            isSelected={lowerWins}
            onSelectedChange={setLowerWins}
            isDisabled={busy}
            accessibilityLabel={t("Lowest score wins")}
            testID="lowest-score-wins"
          >
            <Switch.Thumb />
          </Switch>
        </View>
      </ScrollView>
      <BottomSheet
        isOpen={scorePlayerId !== null}
        onOpenChange={(open) => {
          if (!open) setScorePlayerId(null);
        }}
      >
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content keyboardBehavior="extend">
            <BottomSheet.Close />
            <BottomSheet.Title>{activePlayer?.name ?? t("Score")}</BottomSheet.Title>
            {activePlayer && activeRow && (
              <>
                <ScoreSheetInput
                  player={activePlayer}
                  row={activeRow}
                  busy={busy}
                  onChange={(value) => update(activePlayer.id, { rawScore: value })}
                  scoreLabel={t("Score")}
                  invalidScoreLabel={t("Enter a valid score")}
                />
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 20 }}
                >
                  <Typography className="flex-1 text-foreground">
                    {t("Did not participate")}
                  </Typography>
                  <Switch
                    isSelected={activeRow.notParticipated}
                    onSelectedChange={(value) =>
                      update(activePlayer.id, { notParticipated: value })
                    }
                    isDisabled={busy}
                    accessibilityLabel={`${t("Did not participate")}: ${activePlayer.name}`}
                    testID={`not-participated-${activePlayer.id}`}
                  >
                    <Switch.Thumb />
                  </Switch>
                </View>
              </>
            )}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
      <View
        style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom) }}
        className="border-t border-muted/20 bg-background"
      >
        <Button
          isDisabled={!preview.valid || busy || Boolean(editingTie)}
          onPress={confirm}
          testID="register-match"
        >
          {t("Register match")}
        </Button>
      </View>
    </View>
  );
}
