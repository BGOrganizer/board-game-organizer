import { useAuth } from "@clerk/expo";
import { useCallback, useLayoutEffect, useRef } from "react";

// Expo wraps getToken on every render. Keep its identity stable for effects,
// while forwarding each request to the latest Clerk session.
export function useSessionAuth() {
  const { getToken: currentGetToken, isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const latestGetToken = useRef(currentGetToken);
  useLayoutEffect(() => {
    latestGetToken.current = currentGetToken;
  }, [currentGetToken]);
  const getToken = useCallback(() => latestGetToken.current(), [userId, sessionId]);
  return { getToken, isLoaded, isSignedIn, userId };
}
