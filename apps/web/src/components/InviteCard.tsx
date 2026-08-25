"use client";

import { useInvites } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Card, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Copy, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

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
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useLingui();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    token,
    getToken,
    protectionBypass,
  });

  const onCopy = async () => {
    if (!create.data?.link) return;
    try {
      await navigator.clipboard.writeText(create.data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. http dev): the link is still visible.
    }
  };

  if (!isLoaded || !isSignedIn) return null;

  return (
    <Card className="p-4">
      {create.isPending ? (
        <div className="flex items-center gap-3">
          <Skeleton animationType="pulse" className="h-9 w-32 rounded-lg" />
          <Skeleton animationType="pulse" className="h-4 flex-1 rounded" />
        </div>
      ) : create.isError ? (
        <p className="text-sm text-danger">{t`Could not create the invite. Try again.`}</p>
      ) : create.data ? (
        <div className="flex flex-col gap-2">
          <code className="min-w-0 break-all rounded bg-default-100 p-2 text-sm">
            {create.data.link}
          </code>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onPress={onCopy}>
              <Copy className="h-4 w-4" />
              {copied ? t`Copied!` : t`Copy`}
            </Button>
            <Button size="sm" variant="primary" className="flex-1" onPress={() => create.mutate()}>
              <UserPlus className="h-4 w-4" />
              {t`New invite`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t`Invite a friend`}</p>
            <p className="text-xs text-default-500">
              {t`Generate a link to connect with someone.`}
            </p>
          </div>
          <Button variant="primary" onPress={() => create.mutate()}>
            <UserPlus className="h-4 w-4" />
            {t`Create invite`}
          </Button>
        </div>
      )}
    </Card>
  );
}
