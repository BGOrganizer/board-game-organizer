import type { CreateMatchInput } from "@board-game-organizer/schemas";
import { resolveApiUrl, useMatches } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useAuth } from "@clerk/expo";
import DateTimePicker from "@react-native-community/datetimepicker";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Text } from "heroui-native/text";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Gamepad2,
  Minus,
  Plus,
  Users,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

type DateSlot = { id: string; value: string | null };
type UserSlot = {
  id: string;
  user: { id: string; name: string; email: string | null; avatarUrl: string | null } | null;
};
type GameSlot = {
  id: string;
  game: { id: number; name: string; imageUrl: string | null; year: number | null } | null;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function MatchWizard() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const t = useT();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [dateSlots, setDateSlots] = useState<DateSlot[]>([{ id: uid(), value: null }]);
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [userSlots, setUserSlots] = useState<UserSlot[]>([{ id: uid(), user: null }]);
  const [gameSlots, setGameSlots] = useState<GameSlot[]>([{ id: uid(), game: null }]);

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

  const matches = useMatches({
    apiUrl: apiUrl(),
    token,
    getToken,
  });

  // Consume selections written by the search pages (user/game pickers).
  const pendingUser = useAppStore((s) => s.pendingUser);
  const pendingGame = useAppStore((s) => s.pendingGame);
  const clearPending = useAppStore((s) => s.clearPending);
  useEffect(() => {
    if (pendingUser) {
      setUserSlots((p) =>
        p.map((s) => (s.id === pendingUser.slotId ? { ...s, user: pendingUser.user } : s)),
      );
      clearPending();
    }
  }, [pendingUser, clearPending]);
  useEffect(() => {
    if (pendingGame) {
      setGameSlots((p) =>
        p.map((s) => (s.id === pendingGame.slotId ? { ...s, game: pendingGame.game } : s)),
      );
      clearPending();
    }
  }, [pendingGame, clearPending]);

  const step1Valid = useMemo(
    // The auto-appended empty slot must not block progress: at least one
    // filled date + valid name is enough to continue.
    () => name.trim().length >= 5 && dateSlots.some((s) => s.value !== null),
    [name, dateSlots],
  );
  const step2Valid = useMemo(
    // All required slots must be filled: the creator counts as one player,
    // so with minPlayers=N there must be at least N-1 invited users. The
    // range itself must be coherent too.
    () =>
      minPlayers >= 1 &&
      maxPlayers >= minPlayers &&
      userSlots.filter((s) => s.user !== null).length >= minPlayers - 1,
    [minPlayers, maxPlayers, userSlots],
  );
  const step3Valid = useMemo(() => gameSlots.some((s) => s.game !== null), [gameSlots]);

  const addDateSlot = () => setDateSlots((p) => [...p, { id: uid(), value: null }]);
  const removeDateSlot = (id: string) =>
    setDateSlots((p) => (p.length <= 1 ? p : p.filter((s) => s.id !== id)));
  const setDateSlot = (id: string, iso: string) =>
    setDateSlots((p) => p.map((s) => (s.id === id ? { ...s, value: iso } : s)));

  const slotCount = maxPlayers - 1;
  useEffect(() => {
    setUserSlots((p) => {
      const next = Array.from({ length: slotCount }, (_, i) => p[i] ?? { id: uid(), user: null });
      return next.slice(0, slotCount);
    });
  }, [slotCount]);

  const bumpMin = (d: number) => setMinPlayers((v) => Math.max(1, Math.min(maxPlayers, v + d)));
  const bumpMax = (d: number) => setMaxPlayers((v) => Math.max(minPlayers, v + d));

  const addGameSlot = () => setGameSlots((p) => [...p, { id: uid(), game: null }]);
  const removeGameSlot = (id: string) =>
    setGameSlots((p) => (p.length <= 1 ? p : p.filter((s) => s.id !== id)));

  const create = useCallback(async () => {
    if (!step3Valid) return;
    const input: CreateMatchInput = {
      name: name.trim(),
      dates: dateSlots.flatMap((s) => (s.value ? [s.value] : [])),
      minPlayers,
      maxPlayers,
      invitedUserIds: userSlots.flatMap((s) => (s.user ? [s.user.id] : [])),
      gameIds: gameSlots.flatMap((s) => (s.game ? [s.game.id] : [])),
    };
    try {
      await matches.create.mutateAsync(input);
      router.back();
    } catch {
      // surface error
    }
  }, [step3Valid, name, dateSlots, minPlayers, maxPlayers, userSlots, gameSlots, matches, router]);

  const next = () => {
    if (step === 1 && step1Valid) setStep(2);
    else if (step === 2 && step2Valid) setStep(3);
    else if (step === 3 && step3Valid) void create();
  };
  const back = () => setStep((s) => (s === 2 ? 1 : s === 3 ? 2 : s));

  const fabNext = (
    <Pressable
      onPress={next}
      disabled={step === 1 ? !step1Valid : step === 2 ? !step2Valid : !step3Valid}
      style={{
        position: "absolute",
        right: 20,
        bottom: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: (step === 1 ? !step1Valid : step === 2 ? !step2Valid : !step3Valid)
          ? "#9ca3af"
          : "#006fee",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
      }}
    >
      <ArrowRight color="#fff" size={26} />
    </Pressable>
  );
  const fabBack =
    step > 1 ? (
      <Pressable
        onPress={back}
        style={{
          position: "absolute",
          left: 20,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#e5e7eb",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 6,
        }}
      >
        <ArrowLeft color="#111" size={26} />
      </Pressable>
    ) : null;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {/* Step indicator */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 16 }}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={{
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 4,
                backgroundColor: step === s ? "#006fee" : "#e5e7eb",
              }}
            >
              <Text style={{ color: step === s ? "#fff" : "#6b7280", fontSize: 13 }}>{s}</Text>
            </View>
          ))}
        </View>

        {step === 1 && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "600" }}>{t("New match")}</Text>
            <Input value={name} onChangeText={setName} placeholder={t("e.g. Friday night games")} />
            {name.trim().length > 0 && name.trim().length < 5 && (
              <Text style={{ color: "#f31260", fontSize: 13 }}>{t("At least 5 characters")}</Text>
            )}
            <Text style={{ color: "#6b7280", fontSize: 14 }}>{t("When could you play?")}</Text>
            {dateSlots.map((slot) => (
              <View key={slot.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={() => {
                    setPickingDate(slot.id);
                    setDateValue(slot.value ? new Date(slot.value) : new Date());
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <CalendarClock color="#6b7280" size={18} />
                  <Text style={{ color: slot.value ? "#111" : "#9ca3af" }}>
                    {slot.value ? new Date(slot.value).toLocaleString() : t("Pick date and time")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => removeDateSlot(slot.id)}
                  disabled={dateSlots.length <= 1}
                  style={{ padding: 8 }}
                >
                  <X color={dateSlots.length <= 1 ? "#d1d5db" : "#6b7280"} size={18} />
                </Pressable>
              </View>
            ))}
            <Button onPress={addDateSlot}>
              <Plus size={16} color="#fff" />
              <Text style={{ color: "#fff" }}>{t("Add another date")}</Text>
            </Button>
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "600" }}>{t("Players")}</Text>
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
              <Text style={{ color: "#f31260", fontSize: 13 }}>
                {t("Max must be at least min")}
              </Text>
            )}
            <Text style={{ color: "#6b7280", fontSize: 14 }}>{t("Invite friends")}</Text>
            {userSlots.map((slot) => (
              <View key={slot.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: "/match/search-user", params: { slotId: slot.id } })
                  }
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <Users color="#6b7280" size={18} />
                  <View style={{ flex: 1 }}>
                    {slot.user ? (
                      <>
                        <Text style={{ fontSize: 14, fontWeight: "500" }}>{slot.user.name}</Text>
                        <Text style={{ fontSize: 12, color: "#9ca3af" }}>{slot.user.email}</Text>
                      </>
                    ) : (
                      <Text style={{ color: "#9ca3af" }}>{t("Select a friend")}</Text>
                    )}
                  </View>
                </Pressable>
                {slot.user && (
                  <Pressable
                    onPress={() =>
                      setUserSlots((p) =>
                        p.map((s) => (s.id === slot.id ? { ...s, user: null } : s)),
                      )
                    }
                    style={{ padding: 8 }}
                  >
                    <X color="#6b7280" size={18} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "600" }}>{t("Board games")}</Text>
            {gameSlots.map((slot) => (
              <View key={slot.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                  }}
                >
                  <Gamepad2 color="#6b7280" size={18} />
                  <View style={{ flex: 1 }}>
                    {slot.game ? (
                      <>
                        <Text style={{ fontSize: 14, fontWeight: "500" }}>{slot.game.name}</Text>
                        {slot.game.year ? (
                          <Text style={{ fontSize: 12, color: "#9ca3af" }}>{slot.game.year}</Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={{ color: "#9ca3af" }}>{t("Select a board game")}</Text>
                    )}
                  </View>
                </Pressable>
                {slot.game && (
                  <Pressable
                    onPress={() =>
                      setGameSlots((p) =>
                        p.map((s) => (s.id === slot.id ? { ...s, game: null } : s)),
                      )
                    }
                    style={{ padding: 8 }}
                  >
                    <X color="#6b7280" size={18} />
                  </Pressable>
                )}
              </View>
            ))}
            <Button onPress={addGameSlot}>
              <Plus size={16} color="#fff" />
              <Text style={{ color: "#fff" }}>{t("Add another game")}</Text>
            </Button>
            {matches.create.isError && (
              <Text style={{ color: "#f31260", fontSize: 13 }}>
                {t("Could not create the match")}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {fabBack}
      {fabNext}

      {/* Native date/time picker (Android shows inline, iOS a modal). */}
      {pickingDate && (
        <DateTimePicker
          value={dateValue}
          mode="datetime"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, date) => {
            if (Platform.OS === "android") {
              setPickingDate(null);
              if (event.type === "set" && date) setDateSlot(pickingDate, date.toISOString());
            } else if (date) {
              setDateSlot(pickingDate, date.toISOString());
            }
          }}
        />
      )}
    </View>
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
      <Text style={{ fontSize: 12, color: "#6b7280" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable onPress={onDec} style={{ padding: 8 }}>
          <Minus color="#111" size={18} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>{value}</Text>
        <Pressable onPress={onInc} style={{ padding: 8 }}>
          <Plus color="#111" size={18} />
        </Pressable>
      </View>
    </View>
  );
}
