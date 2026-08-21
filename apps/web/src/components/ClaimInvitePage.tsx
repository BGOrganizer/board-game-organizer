"use client";

import { claimInvite } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Card, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

/**
 * Public claim page for a shareable invite link (/invite/<token>).
 * Signed-out visitors see a prompt to sign in; signed-in users can claim.
 */
export default function ClaimInvitePage({ token }: { token: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { t } = useLingui();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((tok) => active && setSessionToken(tok ?? null))
      .catch(() => active && setSessionToken(null));
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:4000";
  const bypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;

  const onClaim = () => {
    if (!sessionToken) return;
    setError(null);
    claimInvite(apiUrl, sessionToken, token, bypass)
      .then(() => setResult(t`Invite claimed — you are now friends with the inviter!`))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t`Could not claim.`));
  };

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-12">
        <Skeleton animationType="pulse" className="h-6 w-2/3 rounded" />
        <Skeleton animationType="pulse" className="h-12 w-full rounded-lg" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">{t`You have been invited`}</h1>
          <p className="mt-2 text-sm text-default-500">
            {t`Sign in to claim this invite and connect with the inviter.`}
          </p>
          <div className="mt-4">
            <a
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              href={`/sign-in?redirect_url=/invite/${token}`}
            >
              {t`Sign in to claim`}
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="p-6">
        <h1 className="text-lg font-semibold">{t`You have been invited`}</h1>
        <p className="mt-2 text-sm text-default-500">
          {t`Claiming this invite connects you with the inviter.`}
        </p>

        <Button variant="primary" className="mt-4" isDisabled={!sessionToken} onPress={onClaim}>
          {t`Claim invite`}
        </Button>

        {result && <p className="mt-3 text-sm text-success">{result}</p>}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>
    </div>
  );
}
