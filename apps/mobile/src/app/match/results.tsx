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
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import Animated, { LinearTransition, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const rowTransition = LinearTransition.duration(220).reduceMotion(ReduceMotion.System);

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
  const players = [
    data.administrator,
    ...data.invitedPlayers.filter((player) => player.invitation.status === "ACCEPTED"),
  ];
  const names = new Map(players.map((player) => [player.id, player.name]));
  const [rows, setRows] = useState<ScoreDraftRow[]>(() =>
    players.map((player) => ({ userId: player.id, rawScore: "", notParticipated: false })),
  );
  const [lowerWins, setLowerWins] = useState(false);
  const [tieBreaks, setTieBreaks] = useState<RegisterMatchResultsInput["tieBreaks"]>([]);
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
  const update = (id: string, change: Partial<ScoreDraftRow>) =>
    setRows((old) => old.map((row) => (row.userId === id ? { ...row, ...change } : row)));
  const move = (score: string, index: number, direction: -1 | 1) => {
    const current = preview.tieBreaks.find((tie) => tie.score === score);
    if (!current) return;
    const order = [...current.orderedUserIds];
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    setTieBreaks((old) =>
      old.map((tie) => (tie.score === score ? { ...tie, orderedUserIds: order } : tie)),
    );
  };
  const confirm = () => {
    if (!preview.valid || busy) return;
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
        <Typography className="font-semibold text-foreground">{t("Player scores")}</Typography>
        <GroupedList>
          {players.map((player) => {
            const row = rows.find((item) => item.userId === player.id);
            if (!row) return null;
            return (
              <GroupedRow key={player.id}>
                <View style={{ flex: 1, gap: 8 }}>
                  <Typography className="font-medium text-foreground">{player.name}</Typography>
                  <Input
                    value={row.rawScore}
                    onChangeText={(value) => update(player.id, { rawScore: value })}
                    accessibilityLabel={`${t("Score")}: ${player.name}`}
                    placeholder={t("Score")}
                    keyboardType={Platform.OS === "android" ? "numeric" : "numbers-and-punctuation"}
                    editable={!row.notParticipated && !busy}
                    className="text-foreground"
                    aria-invalid={
                      !row.notParticipated &&
                      row.rawScore !== "" &&
                      normalizeMatchScore(row.rawScore) === null
                    }
                    testID={`score-${player.id}`}
                  />
                  {!row.notParticipated &&
                    row.rawScore !== "" &&
                    normalizeMatchScore(row.rawScore) === null && (
                      <Typography className="text-xs text-danger">
                        {t("Enter a valid score")}
                      </Typography>
                    )}
                </View>
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Switch
                    isSelected={row.notParticipated}
                    onSelectedChange={(value) => update(player.id, { notParticipated: value })}
                    isDisabled={busy}
                    accessibilityLabel={`${t("Did not participate")}: ${player.name}`}
                    testID={`not-participated-${player.id}`}
                  >
                    <Switch.Thumb />
                  </Switch>
                  <Typography className="text-xs text-foreground">
                    {t("Did not participate")}
                  </Typography>
                </View>
              </GroupedRow>
            );
          })}
        </GroupedList>
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
        <Typography className="font-semibold text-foreground">{t("Live standings")}</Typography>
        <View style={{ gap: 6 }} className="overflow-hidden rounded-xl bg-surface">
          {groups.map((score) => {
            const tied = preview.ranked.filter((entry) => entry.score === score);
            const active = preview.tieBreaks.some((tie) => tie.score === score);
            return (
              <Fragment key={score}>
                {tied.length > 1 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Typography className="flex-1 text-sm text-foreground">
                      {active ? t("Tie-break applied") : t("Tied score")}: {score}
                    </Typography>
                    <Button
                      size="sm"
                      variant="outline"
                      testID={`resolve-tie-${score}`}
                      isDisabled={busy}
                      onPress={() =>
                        setTieBreaks((old) =>
                          active
                            ? old.filter((tie) => tie.score !== score)
                            : [
                                ...preview.tieBreaks,
                                { score, orderedUserIds: tied.map((entry) => entry.userId) },
                              ],
                        )
                      }
                    >
                      {active ? t("Remove tie-break") : t("Resolve tie")}
                    </Button>
                  </View>
                )}
                {tied.map((entry, index) => (
                  <Animated.View
                    key={entry.userId}
                    layout={rowTransition}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      minHeight: 48,
                      padding: 10,
                    }}
                  >
                    <Typography className="text-sm text-muted">{entry.rank}.</Typography>
                    <Typography className="flex-1 text-foreground" numberOfLines={1}>
                      {names.get(entry.userId)}
                    </Typography>
                    <Typography className="font-semibold text-foreground">{entry.score}</Typography>
                    {active && (
                      <View style={{ flexDirection: "row" }}>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          isDisabled={busy || index === 0}
                          style={{ minHeight: 44, minWidth: 44 }}
                          accessibilityLabel={`${t("Move up")}: ${names.get(entry.userId)}`}
                          onPress={() => move(score, index, -1)}
                        >
                          <ArrowUp size={18} color="#737373" />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          isDisabled={busy || index === tied.length - 1}
                          style={{ minHeight: 44, minWidth: 44 }}
                          accessibilityLabel={`${t("Move down")}: ${names.get(entry.userId)}`}
                          onPress={() => move(score, index, 1)}
                        >
                          <ArrowDown size={18} color="#737373" />
                        </Button>
                      </View>
                    )}
                  </Animated.View>
                ))}
              </Fragment>
            );
          })}
          {preview.ranked
            .filter((entry) => entry.score === null)
            .map((entry) => (
              <Animated.View
                key={entry.userId}
                layout={rowTransition}
                style={{ flexDirection: "row", padding: 12, gap: 8 }}
              >
                <Typography className="flex-1 text-foreground">
                  {names.get(entry.userId)}
                </Typography>
                <Typography className="text-foreground">ND</Typography>
              </Animated.View>
            ))}
        </View>
        {!preview.valid && (
          <Typography className="text-sm text-muted">
            {t(
              "Enter a score for each participant or mark them as not participating. At least one must participate.",
            )}
          </Typography>
        )}
      </ScrollView>
      <View
        style={{ padding: 16, paddingBottom: Math.max(16, insets.bottom) }}
        className="border-t border-muted/20 bg-background"
      >
        <Button isDisabled={!preview.valid || busy} onPress={confirm} testID="register-match">
          {t("Register match")}
        </Button>
      </View>
    </View>
  );
}
