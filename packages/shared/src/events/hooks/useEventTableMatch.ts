"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityAccessDenied,
} from "../../community/communityApi";
import { matchDetailQuery } from "../../matches/hooks/useMatches";

/** Optional match privileges come from the match API, including frozen former participants. */
export function useEventTableMatch(options: CommunityApiOptions, matchId = "") {
  const query = useQuery({
    ...matchDetailQuery({ ...options, matchId, token: null }),
    enabled: options.enabled !== false && Boolean(options.apiUrl && options.userId && matchId),
    retry: false,
  });
  const privateUnavailable =
    query.error instanceof CommunityApiError &&
    (query.error.status === 403 || query.error.status === 404);
  return {
    ...query,
    data: options.enabled === false || communityAccessDenied(query.error) ? undefined : query.data,
    error: privateUnavailable ? null : query.error,
  };
}
