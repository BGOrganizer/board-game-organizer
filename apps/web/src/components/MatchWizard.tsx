"use client";

import type { CreateMatchInput, MatchDetailResponse } from "@board-game-organizer/schemas";
import { resolveApiUrl, useMatches } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar, Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, ArrowRight, Gamepad2, Minus, Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { SearchGamePage } from "./SearchGamePage";
import { SearchUserPage } from "./SearchUserPage";

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

/** A slot (date or user/game item) in the wizard — filled or empty. */
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

export function MatchWizard({
  initialData,
  onCreated,
}: {
  initialData?: MatchDetailResponse;
  onCreated?: () => void;
}) {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { t } = useLingui();
  const mutationFeedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: name + date slots.
  const [name, setName] = useState(initialData?.match.name ?? "");
  const [dateSlots, setDateSlots] = useState<DateSlot[]>(() =>
    initialData
      ? initialData.match.dates.map((value) => ({ id: uid(), value }))
      : [{ id: uid(), value: null }],
  );

  // Step 2: player range + invite slots.
  const [minPlayers, setMinPlayers] = useState(initialData?.match.minPlayers ?? 2);
  const [maxPlayers, setMaxPlayers] = useState(initialData?.match.maxPlayers ?? 4);
  const [userSlots, setUserSlots] = useState<UserSlot[]>(() => {
    const users = initialData?.invitedPlayers
      .filter((player) => player.invitation.status !== "DECLINED")
      .map((user) => ({ id: uid(), user })) ?? [{ id: uid(), user: null }];
    return users.length > 0 ? users : [{ id: uid(), user: null }];
  });

  // Step 3: game slots.
  const [gameSlots, setGameSlots] = useState<GameSlot[]>(() => {
    const games =
      initialData?.games.map((game) => ({
        id: uid(),
        game: {
          id: game.id,
          name: game.name,
          imageUrl: game.thumbnail,
          year: game.yearPublished,
        },
      })) ?? [];
    return games.length > 0 ? games : [{ id: uid(), game: null }];
  });

  // Search page routing (client-side, modal-like overlay).
  const [searchTarget, setSearchTarget] = useState<{ slotId: string } | null>(null);
  const [gameTarget, setGameTarget] = useState<{ slotId: string; excludeIds: number[] } | null>(
    null,
  );

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
    protectionBypass: protectionBypass(),
    userId,
    feedback: mutationFeedback,
  });

  const step1Valid = useMemo(
    // Every date slot must be filled: an added-but-empty slot blocks
    // progress (no "skip the second date" loophole).
    () => name.trim().length >= 5 && dateSlots.every((s) => s.value !== null),
    [name, dateSlots],
  );
  const step2Valid = useMemo(
    () => minPlayers >= 2 && maxPlayers >= minPlayers,
    [minPlayers, maxPlayers],
  );
  const step3Valid = useMemo(
    // Every added game slot must hold a game (same rule as the dates).
    () => gameSlots.every((s) => s.game !== null),
    [gameSlots],
  );

  // ---- Step 1: date slots ----
  const addDateSlot = useCallback(() => {
    setDateSlots((prev) => [...prev, { id: uid(), value: null }]);
  }, []);
  const removeDateSlot = useCallback((id: string) => {
    setDateSlots((prev) =>
      prev.length > 1
        ? prev.filter((slot) => slot.id !== id)
        : prev.map((slot) => (slot.id === id ? { ...slot, value: null } : slot)),
    );
  }, []);
  const setDateSlot = useCallback((id: string, iso: string | null) => {
    setDateSlots((prev) => prev.map((s) => (s.id === id ? { ...s, value: iso } : s)));
  }, []);

  // ---- Step 2: player range drives the invite slot count ----
  const slotCount = maxPlayers - 1; // the creator counts as one player
  useEffect(() => {
    setUserSlots((prev) => {
      const next = Array.from(
        { length: slotCount },
        (_, i) => prev[i] ?? { id: uid(), user: null },
      );
      return next.slice(0, slotCount);
    });
  }, [slotCount]);

  const bumpMin = (delta: number) =>
    setMinPlayers((v) => Math.max(2, Math.min(maxPlayers, v + delta)));
  const bumpMax = (delta: number) => setMaxPlayers((v) => Math.max(minPlayers, v + delta));

  // ---- Step 3: game slots ----
  const addGameSlot = useCallback(() => {
    setGameSlots((prev) => [...prev, { id: uid(), game: null }]);
  }, []);
  const removeGameSlot = useCallback((id: string) => {
    setGameSlots((prev) =>
      prev.length > 1
        ? prev.filter((slot) => slot.id !== id)
        : prev.map((slot) => (slot.id === id ? { ...slot, game: null } : slot)),
    );
  }, []);

  const save = useCallback(async () => {
    if (!step3Valid) return;
    const input: CreateMatchInput = {
      name: name.trim(),
      dates: dateSlots.flatMap((s) => (s.value ? [s.value] : [])),
      minPlayers,
      maxPlayers,
      invitedUserIds: userSlots.map((s) => s.user?.id).filter((x): x is string => Boolean(x)),
      gameIds: gameSlots.map((s) => s.game?.id).filter((x): x is number => Boolean(x)),
    };
    try {
      if (initialData) {
        await matches.update.mutateAsync({ matchId: initialData.match.id, input });
      } else {
        await matches.create.mutateAsync(input);
      }
      onCreated?.();
    } catch {
      // Mutation feedback surfaces the error.
    }
  }, [
    initialData,
    step3Valid,
    name,
    dateSlots,
    minPlayers,
    maxPlayers,
    userSlots,
    gameSlots,
    matches,
    onCreated,
  ]);

  const next = () => {
    if (step === 1 && step1Valid) setStep(2);
    else if (step === 2 && step2Valid) setStep(3);
    else if (step === 3 && step3Valid) void save();
  };
  const back = () => setStep((s) => (s === 2 ? 1 : s === 3 ? 2 : s));

  const fabNext = (
    <Button
      isIconOnly
      variant="primary"
      className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
      aria-label={step === 3 && initialData ? t`Save changes` : t`Next step`}
      isDisabled={
        matches.create.isPending ||
        matches.update.isPending ||
        (step === 1 ? !step1Valid : step === 2 ? !step2Valid : !step3Valid)
      }
      onPress={next}
    >
      <ArrowRight className="h-6 w-6" />
    </Button>
  );
  const fabBack = step > 1 && (
    <Button
      isIconOnly
      variant="secondary"
      className="fixed bottom-4 left-4 z-40 h-12 w-12 rounded-full shadow-lg sm:bottom-6 sm:left-6 sm:h-14 sm:w-14"
      aria-label={t`Previous step`}
      onPress={back}
    >
      <ArrowLeft className="h-6 w-6" />
    </Button>
  );

  if (searchTarget) {
    return (
      <SearchUserPage
        apiUrl={apiUrl()}
        token={token}
        getToken={getToken}
        protectionBypass={protectionBypass()}
        excludeIds={userSlots.flatMap((slot) =>
          slot.id !== searchTarget.slotId && slot.user ? [slot.user.id] : [],
        )}
        onSelect={(user) => {
          setUserSlots((prev) =>
            prev.some((slot) => slot.id !== searchTarget.slotId && slot.user?.id === user.id)
              ? prev
              : prev.map((slot) => (slot.id === searchTarget.slotId ? { ...slot, user } : slot)),
          );
          setSearchTarget(null);
        }}
        onClose={() => setSearchTarget(null)}
      />
    );
  }

  if (gameTarget) {
    return (
      <SearchGamePage
        apiUrl={apiUrl()}
        token={token}
        getToken={getToken}
        protectionBypass={protectionBypass()}
        excludeIds={gameTarget.excludeIds}
        onSelect={(game) => {
          setGameSlots((prev) =>
            prev.map((s) => (s.id === gameTarget.slotId ? { ...s, game } : s)),
          );
          setGameTarget(null);
        }}
        onClose={() => setGameTarget(null)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-28">
      {/* Step indicator */}
      <div className="mb-4 flex items-center justify-center gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={`rounded-full px-3 py-1 ${
              step === s ? "bg-primary text-white" : "bg-default-100 text-default-500"
            }`}
          >
            {s}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{initialData ? t`Edit match` : t`New match`}</h2>
          <p className="text-sm font-medium">{t`Match name`}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t`e.g. Friday night games`}
            aria-label={t`Match name`}
            className="w-full rounded-lg border border-default-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {name.trim().length > 0 && name.trim().length < 5 && (
            <p className="text-sm text-danger">{t`At least 5 characters`}</p>
          )}{" "}
          <p className="text-sm text-default-500">{t`When could you play?`}</p>
          <GroupedList>
            {dateSlots.map((slot) => (
              <GroupedRow
                key={slot.id}
                className="gap-2 focus-within:ring-2 focus-within:ring-primary"
              >
                {/* Native datetime-local: the accessible best practice for
                    date+time picking on the web (no extra deps, keyboard
                    friendly). The value is stored as ISO in the slot. */}
                <input
                  type="datetime-local"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                  value={slot.value ? toLocalInputValue(slot.value) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDateSlot(slot.id, v ? new Date(v).toISOString() : null);
                  }}
                />
                {(dateSlots.length > 1 || slot.value !== null) && (
                  <Button
                    isIconOnly
                    variant="danger-soft"
                    size="sm"
                    className="shrink-0"
                    aria-label={t`Remove slot`}
                    onPress={() => removeDateSlot(slot.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </GroupedRow>
            ))}
          </GroupedList>
          <Button variant="secondary" onPress={addDateSlot}>
            {t`Add another date`}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t`Players`}</h2>
          <div className="flex flex-wrap items-center gap-4 sm:gap-8">
            <div className="flex items-center gap-2">
              <Button
                isIconOnly
                size="sm"
                aria-label={t`Decrease min players`}
                onPress={() => bumpMin(-1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <p className="text-xs text-default-500">{t`Min`}</p>
                <p className="text-lg font-bold">{minPlayers}</p>
              </div>
              <Button
                isIconOnly
                size="sm"
                aria-label={t`Increase min players`}
                onPress={() => bumpMin(1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                isIconOnly
                size="sm"
                aria-label={t`Decrease max players`}
                onPress={() => bumpMax(-1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <p className="text-xs text-default-500">{t`Max`}</p>
                <p className="text-lg font-bold">{maxPlayers}</p>
              </div>
              <Button
                isIconOnly
                size="sm"
                aria-label={t`Increase max players`}
                onPress={() => bumpMax(1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {maxPlayers < minPlayers && (
            <p className="text-sm text-danger">{t`Max must be at least min`}</p>
          )}

          <p className="text-sm text-default-500">{t`Invite friends`}</p>
          <GroupedList>
            {userSlots.map((slot) => (
              <GroupedRow key={slot.id} className="relative">
                <Button
                  variant="ghost"
                  className="w-full min-w-0 justify-start pr-12"
                  onPress={() => setSearchTarget({ slotId: slot.id })}
                >
                  {slot.user ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar size="md" color="accent">
                        <Avatar.Image src={slot.user.avatarUrl ?? undefined} alt="" />
                        <Avatar.Fallback>{slot.user.name.charAt(0) || "?"}</Avatar.Fallback>
                      </Avatar>
                      <span className="min-w-0 text-left">
                        <span className="block truncate text-sm font-medium">{slot.user.name}</span>
                        <span className="block truncate text-xs text-default-400">
                          {slot.user.email}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-default-400">
                      <Users className="h-4 w-4" />
                      {t`Select a friend`}
                    </span>
                  )}
                </Button>
                {slot.user && (
                  <Button
                    isIconOnly
                    variant="danger-soft"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    aria-label={t`Remove invite`}
                    onPress={() =>
                      setUserSlots((prev) =>
                        prev.map((s) => (s.id === slot.id ? { ...s, user: null } : s)),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </GroupedRow>
            ))}
          </GroupedList>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t`Board games`}</h2>
          <GroupedList>
            {gameSlots.map((slot) => (
              <GroupedRow key={slot.id} className="relative">
                <Button
                  variant="ghost"
                  className="w-full min-w-0 justify-start pr-12"
                  onPress={() =>
                    setGameTarget({
                      slotId: slot.id,
                      excludeIds: gameSlots
                        .filter(
                          (s): s is typeof s & { game: NonNullable<typeof s.game> } =>
                            s.id !== slot.id && s.game !== null,
                        )
                        .map((s) => s.game.id),
                    })
                  }
                >
                  {slot.game ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default-100">
                        {slot.game.imageUrl ? (
                          // biome-ignore lint/performance/noImgElement: BGG cover URLs are discovered at runtime.
                          <img
                            src={slot.game.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Gamepad2 className="h-5 w-5 text-default-400" />
                        )}
                      </span>
                      <span className="min-w-0 text-left">
                        <span className="block truncate text-sm font-medium">{slot.game.name}</span>
                        {slot.game.year ? (
                          <span className="block text-xs text-default-400">{slot.game.year}</span>
                        ) : null}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-default-400">
                      <Gamepad2 className="h-4 w-4" />
                      {t`Select a board game`}
                    </span>
                  )}
                </Button>
                {(slot.game || gameSlots.length > 1) && (
                  <Button
                    isIconOnly
                    variant="danger-soft"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    aria-label={t`Remove game`}
                    onPress={() => removeGameSlot(slot.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </GroupedRow>
            ))}
          </GroupedList>
          <Button
            size="sm"
            variant="secondary"
            className="w-fit self-start text-sm"
            onPress={addGameSlot}
          >
            <Plus className="h-4 w-4" />
            {t`Add another game`}
          </Button>
          {(matches.create.isError || matches.update.isError) && (
            <p className="text-sm text-danger">
              {initialData ? t`Could not update the match` : t`Could not create the match`}
            </p>
          )}
        </div>
      )}

      {fabBack}
      {fabNext}
    </div>
  );
}

// ---- Date helpers (web) ----
/** ISO → value for <input type="datetime-local"> (local, no timezone). */
function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
