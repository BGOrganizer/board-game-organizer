"use client";

import { claimInvite } from "@board-game-organizer/shared";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const pendingClaimLifetime = 30 * 60 * 1000;

/** Client claim flow for /invite/<token> on the API domain. */
export default function ClaimInvite({ token }: { token: string }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const resumeClaim = useSearchParams().get("claim") === "1";
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const pendingClaimKey = `bgo:invite-claim:${token}`;
  const callbackUrl = `/invite/${encodeURIComponent(token)}?claim=1`;

  const onClaim = useCallback(async () => {
    if (inFlight.current || result) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      window.sessionStorage.removeItem(pendingClaimKey);
    } catch {
      // Explicit claims also work when browser storage is disabled.
    }
    try {
      const sessionToken = await getToken();
      if (!sessionToken) throw new Error("No session token");
      const res = await claimInvite(window.location.origin, sessionToken, token);
      if (!res.success) throw new Error("Claim failed.");
      setResult("Invite claimed — you are now friends with the inviter!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [token, getToken, result, pendingClaimKey]);

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
      if (startedAt <= now && startedAt >= now - pendingClaimLifetime) void onClaim();
    } catch {
      // Invalid/unavailable local intent never grants consent; the user can claim explicitly.
    }
  }, [isLoaded, isSignedIn, onClaim, pendingClaimKey, resumeClaim]);

  if (!isLoaded) {
    return <Msg title="You have been invited" body="Loading your session…" />;
  }

  if (!isSignedIn) {
    return (
      <Msg title="You have been invited">
        <p>Sign in to claim this invite and connect with the inviter.</p>
        <SignInButton
          mode="modal"
          forceRedirectUrl={callbackUrl}
          signUpForceRedirectUrl={callbackUrl}
        >
          <button type="button" className="btn" onClick={rememberClaim}>
            Sign in to claim
          </button>
        </SignInButton>
      </Msg>
    );
  }

  return (
    <Msg title="You have been invited">
      <p>Claiming this invite connects you with the inviter.</p>
      <button type="button" className="btn" onClick={onClaim} disabled={busy || Boolean(result)}>
        {busy ? "Claiming…" : "Claim invite"}
      </button>
      {result && (
        <p role="status" style={{ color: "#16a34a" }}>
          {result}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}
    </Msg>
  );
}

function Msg({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <main
      style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 480, margin: "0 auto" }}
    >
      <h1>{title}</h1>
      {body ? <p>{body}</p> : null}
      {children}
      <p style={{ marginTop: 32, fontSize: 13, color: "#666" }}>Board Game Organizer</p>
      <style>{`.btn{display:inline-block;margin-top:16px;padding:10px 18px;border-radius:8px;border:0;background:#006fee;color:#fff;font-size:14px;cursor:pointer}.btn:disabled{opacity:.6}`}</style>
    </main>
  );
}
