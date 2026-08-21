"use client";

import { useInvites } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Card, Input, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

export function InvitesTab({
  apiUrl,
  protectionBypass,
}: {
  apiUrl: string;
  protectionBypass?: string | null;
}) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useLingui();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [claimInput, setClaimInput] = useState("");
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((tok) => active && setToken(tok ?? null))
      .catch(() => active && setToken(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const { invites, create, claim } = useInvites({
    apiUrl,
    token,
    getToken,
    protectionBypass,
  });

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard unavailable (e.g. http dev): fall back to selecting nothing.
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex gap-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t`Optional email (auto-connect on claim)`}
            type="email"
          />
          <Button
            variant="primary"
            isDisabled={create.isPending}
            onPress={() => create.mutate({ email: email.trim() || undefined })}
          >
            {t`Create invite`}
          </Button>
        </div>
        {create.isError && (
          <p className="mt-2 text-sm text-danger">{t`Could not create the invite. Try again.`}</p>
        )}
        {create.data && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-default-100 p-3">
            <code className="flex-1 break-all text-sm">{create.data.link}</code>
            <Button size="sm" variant="outline" onPress={() => copyLink(create.data.link)}>
              {t`Copy`}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex gap-2">
          <Input
            value={claimInput}
            onChange={(e) => setClaimInput(e.target.value)}
            placeholder={t`Paste an invite link or token to claim it`}
          />
          <Button
            variant="primary"
            isDisabled={claim.isPending || !claimInput.trim()}
            onPress={() => {
              setClaimMessage(null);
              claim.mutate(
                { inviteLinkOrToken: claimInput },
                {
                  onSuccess: (res) => {
                    setClaimInput("");
                    setClaimMessage(
                      res.autoAccepted
                        ? t`Invite claimed — you are now friends!`
                        : t`Invite claimed — you now follow the inviter.`,
                    );
                  },
                  onError: () => setClaimMessage(t`Could not claim this invite.`),
                },
              );
            }}
          >
            {t`Claim`}
          </Button>
        </div>
        {claimMessage && <p className="mt-2 text-sm text-success">{claimMessage}</p>}
      </Card>

      {invites.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} animationType="pulse" className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!invites.isLoading && (invites.data?.invites.length ?? 0) === 0 && (
        <p className="text-sm text-default-500">{t`No invites yet — create one to share.`}</p>
      )}

      <div className="space-y-2">
        {invites.data?.invites.map((invite) => (
          <Card key={invite.token} className="flex flex-row items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <code className="block truncate text-sm">{invite.link}</code>
              <p className="text-xs text-default-500">
                {invite.status} · {t`expires`} {new Date(invite.expiresAt).toLocaleDateString()}
                {invite.email ? ` · ${invite.email}` : ""}
              </p>
            </div>
            <Button size="sm" variant="outline" onPress={() => copyLink(invite.link)}>
              {t`Copy`}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
