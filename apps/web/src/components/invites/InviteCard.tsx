"use client";

import { useInvites } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { InviteCardView } from "./InviteCardView";

/**
 * Invite-a-friend card: a single button that generates a shareable invite
 * link (no email form). The API builds the link from the origin that
 * received the request, so it always points at the API (preview or
 * production) that created it.
 */
export function InviteCard({
  apiUrl,
  protectionBypass,
}: {
  apiUrl: string;
  protectionBypass?: string | null;
}) {
  const { getToken, userId, isLoaded, isSignedIn } = useAuth();
  const mutationFeedback = useMutationFeedback();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setToken(null);
      return;
    }
    let active = true;
    getToken()
      .then((tok) => active && setToken(tok ?? null))
      .catch(() => active && setToken(null));
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const create = useInvites({
    apiUrl,
    userId,
    token,
    getToken,
    protectionBypass,
    feedback: mutationFeedback,
  });

  if (!isLoaded || !isSignedIn) return null;
  return (
    <InviteCardView
      link={create.data?.link}
      pending={create.isPending}
      failed={create.isError}
      onCreate={() => create.mutate()}
    />
  );
}
