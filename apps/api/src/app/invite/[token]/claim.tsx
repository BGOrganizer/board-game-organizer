"use client";

import type { ClaimResult } from "@board-game-organizer/shared";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { InviteShell } from "./InviteShell";
import { inviteMessages as messages } from "./inviteMessages";

const pendingClaimLifetime = 30 * 60 * 1000;

/** Client claim flow for /invite/<token> on the API domain. */
export default function ClaimInvite({
  token,
  onClaim,
}: {
  token: string;
  onClaim: () => Promise<ClaimResult>;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const { i18n } = useLingui();
  const resumeClaim = useSearchParams().get("claim") === "1";
  const [result, setResult] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const pendingClaimKey = `bgo:invite-claim:${token}`;
  const callbackUrl = `/invite/${encodeURIComponent(token)}?claim=1`;

  const completeClaim = useCallback(async () => {
    if (inFlight.current || result) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      window.sessionStorage.removeItem(pendingClaimKey);
    } catch {
      // Explicit claims also work when browser storage is disabled.
    }
    try {
      const res = await onClaim();
      if (!res.success) {
        setError(true);
        return;
      }
      setResult(true);
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [onClaim, result, pendingClaimKey]);

  const rememberClaim = () => {
    try {
      window.sessionStorage.setItem(pendingClaimKey, String(Date.now()));
    } catch {
      // Blocked session storage leaves the explicit Claim action available after authentication.
    }
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !resumeClaim) return;
    try {
      const stored = window.sessionStorage.getItem(pendingClaimKey);
      if (!stored) return;
      // Consume before starting the request so remounts cannot repeat the original intent.
      window.sessionStorage.removeItem(pendingClaimKey);
      const startedAt = Number(stored);
      const now = Date.now();
      if (startedAt <= now && startedAt >= now - pendingClaimLifetime) void completeClaim();
    } catch {
      // Invalid/unavailable local intent never grants consent; the user can claim explicitly.
    }
  }, [isLoaded, isSignedIn, completeClaim, pendingClaimKey, resumeClaim]);

  if (!isLoaded) {
    return (
      <InviteShell title={i18n._(messages.title)}>
        <div role="status" aria-label={i18n._(messages.sessionLoading)}>
          <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
        </div>
      </InviteShell>
    );
  }

  if (!isSignedIn) {
    return (
      <InviteShell title={i18n._(messages.title)}>
        <p>{i18n._(messages.signInHint)}</p>
        <SignInButton
          mode="modal"
          forceRedirectUrl={callbackUrl}
          signUpForceRedirectUrl={callbackUrl}
        >
          <Button type="button" variant="primary" onClick={rememberClaim}>
            {i18n._(messages.signIn)}
          </Button>
        </SignInButton>
      </InviteShell>
    );
  }

  return (
    <InviteShell title={i18n._(messages.title)}>
      <p>{i18n._(messages.claimHint)}</p>
      <Button
        type="button"
        variant="primary"
        onPress={() => void completeClaim()}
        isDisabled={busy || result}
      >
        {i18n._(busy ? messages.claiming : messages.claim)}
      </Button>
      {result && (
        <p role="status" style={{ color: "var(--success)" }}>
          {i18n._(messages.friendSuccess)}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--danger)" }}>
          {i18n._(messages.claimFailure)}
        </p>
      )}
    </InviteShell>
  );
}
