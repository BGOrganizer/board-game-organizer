"use client";

import { claimInvite } from "@board-game-organizer/shared";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { useCallback, useState } from "react";

/** Client claim flow for /invite/<token> on the API domain. */
export default function ClaimInvite({ token }: { token: string }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onClaim = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sessionToken = await getToken();
      if (!sessionToken) throw new Error("No session token");
      const res = await claimInvite(window.location.origin, sessionToken, token);
      setResult(
        res.success ? "Invite claimed — you are now friends with the inviter!" : "Claim failed.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim.");
    } finally {
      setBusy(false);
    }
  }, [token, getToken]);

  if (!isLoaded) {
    return <Msg title="You have been invited" body="Loading your session…" />;
  }

  if (!isSignedIn) {
    return (
      <Msg title="You have been invited">
        <p>Sign in to claim this invite and connect with the inviter.</p>
        <SignInButton mode="modal" fallbackRedirectUrl={`/invite/${token}`}>
          <button type="button" className="btn">
            Sign in to claim
          </button>
        </SignInButton>
      </Msg>
    );
  }

  return (
    <Msg title="You have been invited">
      <p>Claiming this invite connects you with the inviter.</p>
      <button type="button" className="btn" onClick={onClaim} disabled={busy}>
        {busy ? "Claiming…" : "Claim invite"}
      </button>
      {result && <p style={{ color: "#16a34a" }}>{result}</p>}
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
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
