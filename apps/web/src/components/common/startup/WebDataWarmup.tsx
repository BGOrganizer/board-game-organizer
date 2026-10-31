"use client";
import {
  clearSessionQueryCache,
  resolveApiUrl,
  warmStartupBackground,
  warmStartupPriority,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { useLingui } from "@lingui/react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Same cache plan as mobile, without a web splash or navigation-blocking work. */
export function WebDataWarmup() {
  const { getToken, isLoaded, userId, sessionId } = useAuth();
  const { i18n } = useLingui();
  const locale = i18n.locale.startsWith("it") ? "it" : "en";
  const client = useQueryClient();
  const initialPath = useRef(usePathname());
  const warmed = useRef<string | null>(null);
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    const identity = userId && sessionId ? `${userId}/${sessionId}` : null;
    if (previous.current && previous.current !== identity) clearSessionQueryCache(client);
    previous.current = identity;
    const owner = JSON.stringify([identity, locale]);
    if (!userId || !identity || warmed.current === owner) return;
    let active = true;
    let completed = false;
    let backgroundTimer: ReturnType<typeof setTimeout> | undefined;
    const start = async () => {
      warmed.current = owner;
      const options: Parameters<typeof warmStartupBackground>[1] = {
        apiUrl: resolveApiUrl(process.env.NEXT_PUBLIC_API_URL),
        getToken,
        userId,
        locale,
        protectionBypass: process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS,
      };
      let background: Promise<void> | undefined;
      const startBackground = () => {
        background ??= warmStartupBackground(client, options, () => active);
        return background;
      };
      // A slow primary request must not starve unrelated background reads indefinitely.
      backgroundTimer = setTimeout(() => {
        void startBackground();
      }, 5000);
      await warmStartupPriority(client, options, () => active);
      clearTimeout(backgroundTimer);
      await startBackground();
      completed = true;
    };
    const timer = setTimeout(
      () => void start(),
      /^\/(events|groups)\/[^/]+/.test(initialPath.current) ? 5000 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(backgroundTimer);
      if (!completed) warmed.current = null;
    };
  }, [client, getToken, isLoaded, userId, sessionId, locale]);
  return null;
}
