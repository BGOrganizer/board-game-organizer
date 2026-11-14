"use client";
import { type CommunityApiOptions, resolveApiUrl } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { useMutationFeedback } from "./useMutationFeedback";

const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
export function useCommunityApi(): CommunityApiOptions {
  const { getToken, userId, isLoaded, isSignedIn } = useAuth();
  const feedback = useMutationFeedback();
  return {
    apiUrl,
    getToken,
    userId,
    enabled: Boolean(isLoaded && isSignedIn),
    protectionBypass: process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS,
    feedback,
  };
}
