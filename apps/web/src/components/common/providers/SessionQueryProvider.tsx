"use client";

import { QueryProvider } from "@board-game-organizer/query";
import { useAuth } from "@clerk/nextjs";

export function SessionQueryProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId, sessionId } = useAuth();
  const scope = !isLoaded ? "loading" : userId ? `${userId}:${sessionId ?? ""}` : "signed-out";
  return <QueryProvider key={scope}>{children}</QueryProvider>;
}
