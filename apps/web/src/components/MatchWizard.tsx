"use client";

import type { CreateMatchInput } from "@board-game-organizer/schemas";
import { resolveApiUrl, useMatches } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Gamepad2, Minus, Plus, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export function MatchWizard({ onCreated }: { onCreated?: () => void }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useLingui();
  const [token, setToken] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: name + date slots.
  const [name, setName] = useState("");
  const [dateSlots, setDateSlots] = useState<DateSlot[]>([{ id: uid(), value: null }]);

  // Step 2: player range + invite slots.
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [userSlots, setUserSlots] = useState<UserSlot[]>([{ id: uid(), user: null }]);

  // Step 3: game slots.
  const [gameSlots, setGameSlots] = useState<GameSlot[]>([{ id: uid(), game: null }]);

  // Search page routing (client-side, modal-like overlay).
  const [searchTarget, setSearchTarget] = useState<{ slotId: string } | null>(null);
  const [gameTarget, setGameTarget] = useState<{ slotId: string } | null>(null);

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
  });

  const step1Valid = useMemo(
    () => name.trim().length >= 5 && dateSlots.every((s) => s.value !== null),
    [name, dateSlots],
  );
  const step2Valid = useMemo(
    () => minPlayers >= 1 && maxPlayers >= minPlayers && userSlots.every((s) => s.user !== null),
    [minPlayers, maxPlayers, userSlots],
  );
  const step3Valid = useMemo(() => gameSlots.some((s) => s.game !== null), [gameSlots]);

  // ---- Step 1: date slots ----
  const addDateSlot = useCallback(() => {
    setDateSlots((prev) => [...prev, { id: uid(), value: null }]);
  }, []);
  const removeDateSlot = useCallback((id: string) => {
    setDateSlots((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  }, []);
  const setDateSlot = useCallback((id: string, iso: string) => {
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
    setMinPlayers((v) => Math.max(1, Math.min(maxPlayers, v + delta)));
  const bumpMax = (delta: number) => setMaxPlayers((v) => Math.max(minPlayers, v + delta));

  // ---- Step 3: game slots ----
  const addGameSlot = useCallback(() => {
    setGameSlots((prev) => [...prev, { id: uid(), game: null }]);
  }, []);
  const removeGameSlot = useCallback((id: string) => {
    setGameSlots((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  }, []);

  const create = useCallback(async () => {
    if (!step3Valid) return;
    const input: CreateMatchInput = {
      name: name.trim(),
      dates: dateSlots.map((s) => s.value!).filter(Boolean),
      minPlayers,
      maxPlayers,
      invitedUserIds: userSlots.map((s) => s.user?.id).filter((x): x is string => Boolean(x)),
      gameIds: gameSlots.map((s) => s.game?.id).filter((x): x is number => Boolean(x)),
    };
    try {
      await matches.create.mutateAsync(input);
      onCreated?.();
    } catch {
      // surface error
    }
  }, [
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
    else if (step === 3 && step3Valid) void create();
  };
  const back = () => setStep((s) => (s === 2 ? 1 : s === 3 ? 2 : s));

  const fabNext = (
    <Button
      isIconOnly
      variant="primary"
      className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
      aria-label={t`Next step`}
      isDisabled={step === 1 ? !step1Valid : step === 2 ? !step2Valid : !step3Valid}
      onPress={next}
    >
      <Plus className="h-6 w-6" />
    </Button>
  );
  const fabBack = step > 1 && (
    <Button
      isIconOnly
      variant="secondary"
      className="fixed bottom-6 left-6 z-40 h-14 w-14 rounded-full shadow-lg"
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
        onSelect={(user) => {
          setUserSlots((prev) =>
            prev.map((s) => (s.id === searchTarget.slotId ? { ...s, user } : s)),
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
    <div className="mx-auto w-full max-w-md pb-28">
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
          <h2 className="text-lg font-semibold">{t`New match`}</h2>
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
          <div className="space-y-2">
            {dateSlots.map((slot) => (
              <div key={slot.id} className="flex items-center gap-2">
                {/* Native datetime-local: the accessible best practice for
                    date+time picking on the web (no extra deps, keyboard
                    friendly). The value is stored as ISO in the slot. */}
                <input
                  type="datetime-local"
                  className="w-full rounded-lg border border-default-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                  value={slot.value ? toLocalInputValue(slot.value) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setDateSlot(slot.id, new Date(v).toISOString());
                  }}
                />
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  aria-label={t`Remove slot`}
                  isDisabled={dateSlots.length <= 1}
                  onPress={() => removeDateSlot(slot.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="secondary" onPress={addDateSlot}>
            {t`Add another date`}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t`Players`}</h2>
          <div className="flex items-center gap-4">
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
          <div className="space-y-2">
            {userSlots.map((slot) => (
              <div key={slot.id} className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="flex-1 justify-start"
                  onPress={() => setSearchTarget({ slotId: slot.id })}
                >
                  {slot.user ? (
                    <span className="flex items-center gap-2">
                      {slot.user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={slot.user.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                      ) : null}
                      <span className="text-left">
                        <span className="block text-sm font-medium">{slot.user.name}</span>
                        <span className="block text-xs text-default-400">{slot.user.email}</span>
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
                    variant="ghost"
                    size="sm"
                    aria-label={t`Remove invite`}
                    onPress={() =>
                      setUserSlots((prev) =>
                        prev.map((s) => (s.id === slot.id ? { ...s, user: null } : s)),
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t`Board games`}</h2>
          <div className="space-y-2">
            {gameSlots.map((slot) => (
              <div key={slot.id} className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="flex-1 justify-start"
                  onPress={() => setGameTarget({ slotId: slot.id })}
                >
                  {slot.game ? (
                    <span className="flex items-center gap-2">
                      {slot.game.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={slot.game.imageUrl} alt="" className="h-6 w-6 rounded" />
                      ) : (
                        <Gamepad2 className="h-6 w-6 text-default-400" />
                      )}
                      <span className="text-left">
                        <span className="block text-sm font-medium">{slot.game.name}</span>
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
                {slot.game && (
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label={t`Remove game`}
                    onPress={() =>
                      setGameSlots((prev) =>
                        prev.map((s) => (s.id === slot.id ? { ...s, game: null } : s)),
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button variant="secondary" onPress={addGameSlot}>
            {t`Add another game`}
          </Button>
          {matches.create.isError && (
            <p className="text-sm text-danger">{t`Could not create the match`}</p>
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
