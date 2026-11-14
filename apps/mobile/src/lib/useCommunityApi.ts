import { type CommunityApiOptions, resolveApiUrl } from "@board-game-organizer/shared";
import Constants from "expo-constants";
import { useMutationFeedback } from "./useMutationFeedback";
import { useSessionAuth } from "./useSessionAuth";

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
export function useCommunityApi(): CommunityApiOptions {
  const { getToken, userId, isLoaded, isSignedIn } = useSessionAuth();
  const feedback = useMutationFeedback();
  return { apiUrl, getToken, userId, enabled: Boolean(isLoaded && isSignedIn), feedback };
}
