import type {
  CreateMatchInput,
  MatchDetailResponse,
  MatchLocation,
} from "@board-game-organizer/schemas";
import {
  formatLocationAddress,
  formatMatchDateTime,
  listRoles,
  resolveApiUrl,
  useFavoriteLocations,
  useGroups,
  useMatches,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useLingui } from "@lingui/react";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Select } from "heroui-native/select";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Clock3,
  Gamepad2,
  MapPin,
  Minus,
  Plus,
  Save,
  Trash2,
  Users,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatingActions } from "@/components/FloatingActions";
import { GameCatalogMetadata } from "@/components/GameCatalogMetadata";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { LocationFavoriteButton } from "@/components/LocationFavoriteButton";
import { floatingActionLayout } from "@/lib/floating-actions";
import { useT } from "@/lib/i18n";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { useSessionAuth } from "@/lib/useSessionAuth";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

type DateSlot = { id: string; value: string | null };
type LocationSlot = { id: string; location: MatchLocation | null };
type UserSlot = {
  id: string;
  user: { id: string; name: string; email: string | null; avatarUrl: string | null } | null;
};
type GameSlot = {
  id: string;
  game: {
    id: number;
    name: string;
    imageUrl: string | null;
    year: number | null;
    average?: number | null;
    rank?: number | null;
  } | null;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function MatchWizard({ initialData }: { initialData?: MatchDetailResponse }) {
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const t = useT();
  const { i18n } = useLingui();
  const mutationFeedback = useMutationFeedback();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState(initialData?.match.name ?? "");
  const [groupId, setGroupId] = useState(initialData?.match.groupId ?? "");
  const [isPublic, setIsPublic] = useState(
    !initialData?.match.groupId && (initialData?.match.isPublic ?? false),
  );
  const [dateSlots, setDateSlots] = useState<DateSlot[]>(() =>
    initialData
      ? initialData.match.dates.map((value) => ({ id: uid(), value }))
      : [{ id: uid(), value: null }],
  );
  const [locationSlots, setLocationSlots] = useState<LocationSlot[]>(() =>
    initialData?.match.locations?.length
      ? initialData.match.locations.map((location) => ({ id: uid(), location }))
      : [{ id: uid(), location: null }],
  );
  const [minPlayers, setMinPlayers] = useState(initialData?.match.minPlayers ?? 2);
  const [maxPlayers, setMaxPlayers] = useState(initialData?.match.maxPlayers ?? 4);
  const [userSlots, setUserSlots] = useState<UserSlot[]>(() => {
    const users = initialData?.invitedPlayers
      .filter((player) => player.invitation.status !== "DECLINED")
      .map((user) => ({ id: uid(), user })) ?? [{ id: uid(), user: null }];
    return users.length > 0 ? users : [{ id: uid(), user: null }];
  });
  const [gameSlots, setGameSlots] = useState<GameSlot[]>(() => {
    const games =
      initialData?.games.map((game) => ({
        id: uid(),
        game: {
          id: game.id,
          name: game.name,
          imageUrl: game.thumbnail,
          year: game.yearPublished,
          average: game.average,
          rank: game.rank,
        },
      })) ?? [];
    return games.length > 0 ? games : [{ id: uid(), game: null }];
  });

  // Which slot is currently picking a date (native picker).
  const [pickingDate, setPickingDate] = useState<string | null>(null);
  const [dateValue, setDateValue] = useState(new Date());

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((tok) => active && setToken(tok ?? null))
      .catch(() => active && setToken(null));
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const groups = useGroups({ apiUrl: apiUrl(), token, getToken, userId });
  const selectedGroup = groups.list.data?.find((group) => group.id === groupId);
  const matches = useMatches({
    apiUrl: apiUrl(),
    token,
    getToken,
    userId,
    feedback: mutationFeedback,
    listFilters: { query: "", roles: listRoles, limit: 20 },
  });

  const favorites = useFavoriteLocations(
    { apiUrl: apiUrl(), getToken, userId, feedback: mutationFeedback },
    locationSlots.flatMap((slot) => (slot.location ? [slot.location] : [])),
  );
  // Consume selections written by the search pages (user/game pickers).
  const pendingUser = useAppStore((s) => s.pendingUser);
  const pendingGame = useAppStore((s) => s.pendingGame);
  const pendingLocation = useAppStore((s) => s.pendingLocation);
  const clearPending = useAppStore((s) => s.clearPending);
  useEffect(() => {
    if (pendingUser && userSlots.some((slot) => slot.id === pendingUser.slotId)) {
      setUserSlots((p) =>
        p.some((s) => s.id !== pendingUser.slotId && s.user?.id === pendingUser.user.id)
          ? p
          : p.map((s) => (s.id === pendingUser.slotId ? { ...s, user: pendingUser.user } : s)),
      );
      clearPending();
    }
  }, [pendingUser, userSlots, clearPending]);
  useEffect(() => {
    if (pendingGame) {
      setGameSlots((p) =>
        p.map((s) => (s.id === pendingGame.slotId ? { ...s, game: pendingGame.game } : s)),
      );
      clearPending();
    }
  }, [pendingGame, clearPending]);
  useEffect(() => {
    if (!pendingLocation) return;
    setLocationSlots((slots) =>
      slots.map((slot) =>
        slot.id === pendingLocation.slotId ? { ...slot, location: pendingLocation.location } : slot,
      ),
    );
    clearPending();
  }, [pendingLocation, clearPending]);

  const step1Valid = useMemo(
    // Every date slot must be filled: an added-but-empty slot blocks
    // progress (no "skip the second date" loophole).
    () =>
      name.trim().length >= 5 &&
      dateSlots.every((s) => s.value !== null) &&
      (!groupId || Boolean(selectedGroup)),
    [name, dateSlots, groupId, selectedGroup],
  );
  const locationsValid =
    locationSlots.length > 0 && locationSlots.every((slot) => slot.location !== null);
  const step2Valid = useMemo(
    () =>
      minPlayers >= 2 &&
      maxPlayers >= minPlayers &&
      (!groupId ||
        userSlots.every(
          (slot) =>
            !slot.user ||
            selectedGroup?.memberProfiles.some((member) => member.id === slot.user?.id),
        )),
    [minPlayers, maxPlayers, groupId, userSlots, selectedGroup],
  );
  const step3Valid = useMemo(
    // Every added game slot must hold a game (same rule as the dates).
    () => gameSlots.every((s) => s.game !== null),
    [gameSlots],
  );

  const addDateSlot = () => setDateSlots((p) => [...p, { id: uid(), value: null }]);
  const removeDateSlot = (id: string) =>
    setDateSlots((p) =>
      p.length > 1
        ? p.filter((slot) => slot.id !== id)
        : p.map((slot) => (slot.id === id ? { ...slot, value: null } : slot)),
    );
  const setDateSlot = (id: string, iso: string) =>
    setDateSlots((p) => p.map((s) => (s.id === id ? { ...s, value: iso } : s)));

  // Android has no "datetime" mode (ANDROID_MODE is date | time only);
  // passing mode="datetime" makes the lib crash on unmount
  // (pickers["datetime"] is undefined -> "dismiss of undefined"). Chain the
  // date and time dialogs with the imperative API instead.
  const pickDateTimeOnAndroid = (slotId: string, initial: Date) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: "date",
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return; // cancelled
        DateTimePickerAndroid.open({
          value: date,
          mode: "time",
          onChange: (timeEvent, dateTime) => {
            if (timeEvent.type === "set" && dateTime) {
              setDateSlot(slotId, dateTime.toISOString());
            }
          },
        });
      },
    });
  };

  const slotCount = maxPlayers - 1;
  useEffect(() => {
    setUserSlots((p) => {
      const next = Array.from({ length: slotCount }, (_, i) => p[i] ?? { id: uid(), user: null });
      return next.slice(0, slotCount);
    });
  }, [slotCount]);

  const bumpMin = (d: number) => setMinPlayers((v) => Math.max(2, Math.min(maxPlayers, v + d)));
  const bumpMax = (d: number) => setMaxPlayers((v) => Math.max(minPlayers, v + d));

  const addGameSlot = () => setGameSlots((p) => [...p, { id: uid(), game: null }]);
  const removeGameSlot = (id: string) =>
    setGameSlots((p) =>
      p.length > 1
        ? p.filter((s) => s.id !== id)
        : p.map((s) => (s.id === id ? { ...s, game: null } : s)),
    );

  const save = useCallback(async () => {
    if (!step3Valid || !locationsValid) return;
    const input: CreateMatchInput = {
      name: name.trim(),
      isPublic: !groupId && isPublic,
      dates: dateSlots.flatMap((s) => (s.value ? [s.value] : [])),
      locations: locationSlots.flatMap((s) => (s.location ? [s.location] : [])),
      minPlayers,
      maxPlayers,
      invitedUserIds: userSlots.flatMap((s) => (s.user ? [s.user.id] : [])),
      gameIds: gameSlots.flatMap((s) => (s.game ? [s.game.id] : [])),
      ...(groupId ? { groupId } : {}),
    };
    try {
      if (initialData) {
        await matches.update.mutateAsync({
          matchId: initialData.match.id,
          input: { ...input, groupId: groupId || null },
        });
        router.back();
      } else {
        await matches.create.mutateAsync(input);
        router.back();
      }
    } catch {
      // Mutation feedback surfaces the error.
    }
  }, [
    initialData,
    step3Valid,
    locationsValid,
    locationSlots,
    name,
    dateSlots,
    minPlayers,
    maxPlayers,
    userSlots,
    gameSlots,
    groupId,
    matches,
    router,
  ]);

  const next = () => {
    if (step === 1 && step1Valid) setStep(2);
    else if (step === 2 && locationsValid) setStep(3);
    else if (step === 3 && step2Valid) setStep(4);
    else if (step === 4 && step3Valid) void save();
  };
  const back = () => setStep((s) => (s === 2 ? 1 : s === 3 ? 2 : s === 4 ? 3 : s));

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          paddingBottom: floatingActionLayout(insets.bottom, 100).paddingBottom,
        }}
      >
        {/* Step indicator */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 16 }}>
          {[1, 2, 3, 4].map((s) => (
            <View
              key={s}
              style={{
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 4,
                backgroundColor: step === s ? "#006fee" : "#e5e7eb",
              }}
            >
              <Typography style={{ color: step === s ? "#fff" : "#6b7280", fontSize: 13 }}>
                {s}
              </Typography>
            </View>
          ))}
        </View>

        {step === 1 && (
          <View style={{ gap: 16 }}>
            <Typography style={{ fontSize: 18, fontWeight: "600" }}>
              {initialData ? t("Edit match") : t("New match")}
            </Typography>
            <Input value={name} onChangeText={setName} placeholder={t("e.g. Friday night games")} />
            {name.trim().length > 0 && name.trim().length < 5 && (
              <Typography style={{ color: "#f31260", fontSize: 13 }}>
                {t("At least 5 characters")}
              </Typography>
            )}
            <Typography style={{ color: "#6b7280", fontSize: 14 }}>
              {t("Group (optional)")}
            </Typography>
            {groups.list.isError ? (
              <Typography className="text-danger">{t("Could not load groups")}</Typography>
            ) : null}
            <Select
              presentation="bottom-sheet"
              value={{
                value: groupId || "none",
                label: selectedGroup?.name ?? (groupId || t("No group")),
              }}
              onValueChange={(item) => {
                if (!Array.isArray(item)) {
                  const next = item?.value === "none" ? "" : (item?.value ?? "");
                  setGroupId(next);
                  if (next) setIsPublic(false);
                }
              }}
              isDisabled={groups.list.isPending || groups.list.isError}
            >
              <Select.Trigger accessibilityLabel={t("Group (optional)")}>
                <Select.Value placeholder={t("No group")} />
                <Select.TriggerIndicator />
              </Select.Trigger>
              <Select.Portal>
                <Select.Overlay />
                <Select.Content presentation="bottom-sheet">
                  <Select.ListLabel>{t("Group (optional)")}</Select.ListLabel>
                  <Select.Item value="none" label={t("No group")} />
                  {groups.list.data
                    ?.filter(
                      (group) =>
                        group.adminUserId === userId ||
                        group.invitations.some(
                          (invitation) =>
                            invitation.inviteeUserId === userId && invitation.status === "ACCEPTED",
                        ),
                    )
                    .map((group) => (
                      <Select.Item key={group.id} value={group.id} label={group.name} />
                    ))}
                </Select.Content>
              </Select.Portal>
            </Select>
            {groupId && !selectedGroup && !groups.list.isPending ? (
              <Typography className="text-danger">{t("Selected group is unavailable")}</Typography>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Typography>
                {!groupId && isPublic ? t("Public match") : t("Private match")}
              </Typography>
              <Switch
                testID="match-public-switch"
                accessibilityLabel={t("Public match")}
                isSelected={!groupId && isPublic}
                isDisabled={Boolean(groupId)}
                onSelectedChange={setIsPublic}
              />
            </View>
            <Typography className="text-muted" style={{ fontSize: 13 }}>
              {groupId
                ? t(
                    "Group matches are private. Only group members can request to join, with admin approval.",
                  )
                : isPublic
                  ? t(
                      "Anyone with the match link can request to join while planning and with free slots. The admin approves requests.",
                    )
                  : t("Only the admin can invite players to a private match.")}
            </Typography>
            <Typography style={{ color: "#6b7280", fontSize: 14 }}>
              {t("When could you play?")}
            </Typography>
            <GroupedList>
              {dateSlots.map((slot) => (
                <GroupedRow key={slot.id}>
                  <Pressable
                    onPress={() => {
                      const base = slot.value ? new Date(slot.value) : new Date();
                      if (Platform.OS === "android") {
                        pickDateTimeOnAndroid(slot.id, base);
                        return;
                      }
                      setPickingDate(slot.id);
                      setDateValue(base);
                    }}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 44,
                      paddingVertical: 4,
                    }}
                  >
                    {slot.value ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <CalendarDays color="#6b7280" size={18} />
                        <Typography className="text-foreground">
                          {formatMatchDateTime(slot.value, i18n.locale).date}
                        </Typography>
                        <Clock3 color="#6b7280" size={18} />
                        <Typography className="text-foreground">
                          {formatMatchDateTime(slot.value, i18n.locale).time}
                        </Typography>
                      </View>
                    ) : (
                      <>
                        <CalendarClock color="#6b7280" size={18} />
                        <Typography className="text-muted">{t("Pick date and time")}</Typography>
                      </>
                    )}
                  </Pressable>
                  {(dateSlots.length > 1 || slot.value !== null) && (
                    <Button
                      variant="danger-soft"
                      isIconOnly
                      size="sm"
                      style={{ minHeight: 36, minWidth: 36, marginRight: 8 }}
                      accessibilityLabel={t("Remove slot")}
                      testID="remove-date-slot"
                      onPress={() => removeDateSlot(slot.id)}
                    >
                      <Trash2 color="#dc2626" size={16} />
                    </Button>
                  )}
                </GroupedRow>
              ))}
            </GroupedList>
            <Button
              size="sm"
              variant="primary"
              style={{ alignSelf: "flex-start" }}
              onPress={addDateSlot}
            >
              <Plus size={16} color="#fff" />
              <Typography style={{ color: "#fff" }}>{t("Add date")}</Typography>
            </Button>
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 16 }}>
            <Typography style={{ fontSize: 18, fontWeight: "600" }}>{t("Locations")}</Typography>
            <GroupedList>
              {locationSlots.map((slot) => (
                <GroupedRow key={slot.id}>
                  {slot.location ? (
                    <LocationFavoriteButton
                      location={slot.location}
                      favorites={favorites}
                      matchId={initialData?.match.id}
                    />
                  ) : (
                    <MapPin size={20} color="#6b7280" />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={slot.location?.name ?? t("Select location")}
                    testID={`location-slot-${slot.id}`}
                    onPress={() =>
                      router.push({
                        pathname: "/match/search-location",
                        params: {
                          slotId: slot.id,
                          ...(slot.location ? { initial: JSON.stringify(slot.location) } : {}),
                        },
                      })
                    }
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      minHeight: 44,
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Typography
                        className="font-medium text-foreground"
                        style={{ fontSize: 14, lineHeight: 20 }}
                        numberOfLines={1}
                      >
                        {slot.location?.name ?? t("Select location")}
                      </Typography>
                      {slot.location && (
                        <Typography
                          className="text-xs text-muted"
                          style={{ fontSize: 12, lineHeight: 16 }}
                          numberOfLines={1}
                          accessibilityLabel={slot.location.address}
                        >
                          {formatLocationAddress(slot.location.address)}
                        </Typography>
                      )}
                    </View>
                  </Pressable>
                  <Button
                    variant="danger-soft"
                    isIconOnly
                    size="sm"
                    style={{ minHeight: 44, minWidth: 44, marginRight: 8 }}
                    accessibilityLabel={t("Remove location")}
                    onPress={() =>
                      setLocationSlots((slots) => slots.filter((item) => item.id !== slot.id))
                    }
                  >
                    <Trash2 size={18} color="#f31260" />
                  </Button>
                </GroupedRow>
              ))}
            </GroupedList>
            {favorites.status.isError && (
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Could not load favorite locations")}
              </Typography>
            )}
            <Button
              variant="primary"
              size="sm"
              style={{ alignSelf: "flex-start" }}
              onPress={() => setLocationSlots((slots) => [...slots, { id: uid(), location: null }])}
            >
              <Plus size={18} color="#fff" />
              <Button.Label>{t("Add location")}</Button.Label>
            </Button>
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: 16 }}>
            <Typography style={{ fontSize: 18, fontWeight: "600" }}>{t("Players")}</Typography>
            <View style={{ flexDirection: "row", gap: 24 }}>
              <Stepper
                label={t("Min")}
                value={minPlayers}
                onDec={() => bumpMin(-1)}
                onInc={() => bumpMin(1)}
              />
              <Stepper
                label={t("Max")}
                value={maxPlayers}
                onDec={() => bumpMax(-1)}
                onInc={() => bumpMax(1)}
              />
            </View>
            {maxPlayers < minPlayers && (
              <Typography style={{ color: "#f31260", fontSize: 13 }}>
                {t("Max must be at least min")}
              </Typography>
            )}
            <Typography style={{ color: "#6b7280", fontSize: 14 }}>
              {groupId ? t("Invite group members") : t("Invite friends")}
            </Typography>
            {groupId &&
            userSlots.some(
              (slot) =>
                slot.user &&
                !selectedGroup?.memberProfiles.some((member) => member.id === slot.user?.id),
            ) ? (
              <Typography className="text-danger">
                {t("Remove players who are not members of the selected group")}
              </Typography>
            ) : null}
            <GroupedList>
              {userSlots.map((slot) => (
                <GroupedRow key={slot.id}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/match/search-user",
                        params: {
                          slotId: slot.id,
                          ...(groupId ? { groupId } : {}),
                          exclude: userSlots
                            .flatMap((s) => (s.id !== slot.id && s.user ? [s.user.id] : []))
                            .join(","),
                        },
                      })
                    }
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 44,
                      paddingVertical: 4,
                    }}
                  >
                    {slot.user ? (
                      <Avatar size="md">
                        {slot.user.avatarUrl ? (
                          <Avatar.Image source={{ uri: slot.user.avatarUrl }} />
                        ) : null}
                        <Avatar.Fallback>{slot.user.name.charAt(0) || "?"}</Avatar.Fallback>
                      </Avatar>
                    ) : (
                      <Users color="#6b7280" size={18} />
                    )}
                    <View style={{ flex: 1 }}>
                      {slot.user ? (
                        <>
                          <Typography style={{ fontSize: 14, fontWeight: "500" }}>
                            {slot.user.name}
                          </Typography>
                          <Typography style={{ fontSize: 12, color: "#9ca3af" }}>
                            {slot.user.email}
                          </Typography>
                        </>
                      ) : (
                        <Typography style={{ color: "#9ca3af" }}>
                          {groupId ? t("Select group member") : t("Select a friend")}
                        </Typography>
                      )}
                    </View>
                  </Pressable>
                  {slot.user && (
                    <Button
                      variant="danger-soft"
                      isIconOnly
                      size="sm"
                      style={{ minHeight: 36, minWidth: 36, marginRight: 8 }}
                      accessibilityLabel={t("Remove invite")}
                      testID="remove-invite-slot"
                      onPress={() =>
                        setUserSlots((p) =>
                          p.map((s) => (s.id === slot.id ? { ...s, user: null } : s)),
                        )
                      }
                    >
                      <Trash2 color="#dc2626" size={16} />
                    </Button>
                  )}
                </GroupedRow>
              ))}
            </GroupedList>
          </View>
        )}

        {step === 4 && (
          <View style={{ gap: 16 }}>
            <Typography style={{ fontSize: 18, fontWeight: "600" }}>{t("Board games")}</Typography>
            <GroupedList>
              {gameSlots.map((slot) => (
                <GroupedRow key={slot.id}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/match/search-game",
                        params: {
                          slotId: slot.id,
                          exclude: gameSlots
                            .filter(
                              (s): s is typeof s & { game: NonNullable<typeof s.game> } =>
                                s.id !== slot.id && s.game !== null,
                            )
                            .map((s) => s.game.id)
                            .join(","),
                        },
                      })
                    }
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 44,
                      paddingVertical: 4,
                    }}
                  >
                    <View
                      className="bg-muted/20"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {slot.game?.imageUrl ? (
                        <Image
                          source={{ uri: slot.game.imageUrl }}
                          accessible={false}
                          style={{ width: 40, height: 40 }}
                        />
                      ) : (
                        <Gamepad2 color="#6b7280" size={18} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      {slot.game ? (
                        <>
                          <Typography
                            style={{ fontSize: 14, fontWeight: "500" }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {slot.game.name}
                          </Typography>
                          <GameCatalogMetadata
                            year={slot.game.year}
                            average={slot.game.average}
                            rank={slot.game.rank}
                          />
                        </>
                      ) : (
                        <Typography style={{ color: "#9ca3af" }}>
                          {t("Select a board game")}
                        </Typography>
                      )}
                    </View>
                  </Pressable>
                  {(slot.game || gameSlots.length > 1) && (
                    <Button
                      variant="danger-soft"
                      isIconOnly
                      size="sm"
                      style={{ minHeight: 44, minWidth: 44, marginRight: 8 }}
                      accessibilityLabel={t("Remove game")}
                      testID="remove-game-slot"
                      onPress={() => removeGameSlot(slot.id)}
                    >
                      <Trash2 color="#dc2626" size={16} />
                    </Button>
                  )}
                </GroupedRow>
              ))}
            </GroupedList>
            <Button
              size="sm"
              variant="primary"
              onPress={addGameSlot}
              style={{ alignSelf: "flex-start" }}
            >
              <Plus size={14} color="#fff" />
              <Typography style={{ color: "#fff", fontSize: 13 }}>{t("Add game")}</Typography>
            </Button>
            {(matches.create.isError || matches.update.isError) && (
              <Typography style={{ color: "#f31260", fontSize: 13 }}>
                {initialData ? t("Could not update the match") : t("Could not create the match")}
              </Typography>
            )}
          </View>
        )}
      </ScrollView>

      {step > 1 ? (
        <FloatingActions
          label="Back"
          testID="previous-step-fab"
          onPress={back}
          extraBottom={92}
          left={true}
          variant="secondary"
        >
          <ArrowLeft color="#111" size={26} />
        </FloatingActions>
      ) : null}

      <FloatingActions
        label={step === 4 ? (initialData ? "Save changes" : "Create match") : "Next step"}
        testID={step === 4 ? "save-match-fab" : "next-step-fab"}
        onPress={next}
        extraBottom={92}
        variant={step === 4 ? "primary" : "secondary"}
        isDisabled={
          matches.create.isPending ||
          matches.update.isPending ||
          (step === 1
            ? !step1Valid
            : step === 2
              ? !locationsValid
              : step === 3
                ? !step2Valid
                : !step3Valid)
        }
      >
        {step === 4 ? <Save color="#fff" size={26} /> : <ArrowRight color="#111" size={26} />}
      </FloatingActions>

      {/* Native date/time picker: iOS renders an inline spinner (datetime
          mode exists on iOS); Android uses the imperative chained date →
          time dialogs in pickDateTimeOnAndroid. */}
      {Platform.OS !== "android" && pickingDate && (
        <DateTimePicker
          value={dateValue}
          mode="datetime"
          display="spinner"
          onChange={(_, date) => {
            if (date) setDateSlot(pickingDate, date.toISOString());
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <Typography style={{ fontSize: 12, color: "#6b7280" }}>{label}</Typography>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable onPress={onDec} style={{ padding: 8 }}>
          <Minus color="#111" size={18} />
        </Pressable>
        <Typography style={{ fontSize: 20, fontWeight: "700" }}>{value}</Typography>
        <Pressable onPress={onInc} style={{ padding: 8 }}>
          <Plus color="#111" size={18} />
        </Pressable>
      </View>
    </View>
  );
}
