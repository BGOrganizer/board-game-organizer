"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { UserProfile } from "../../common/types";
import { CommunityApiError, communityRequest } from "../../community/communityApi";
import { profileQueryOptions, type UseProfileOptions } from "./useProfile";

/** Background app preference sync: independent of notification permission, never a user-action toast. */
export function usePreferredLanguageSync(options: UseProfileOptions, locale: "en" | "it") {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationKey: ["profile", options.apiUrl, options.userId, "language"],
    scope: { id: JSON.stringify(["profile-language", options.apiUrl, options.userId]) },
    mutationFn: ({
      owner,
      language,
      signal,
    }: {
      owner: UseProfileOptions;
      language: "en" | "it";
      signal: AbortSignal;
    }) =>
      communityRequest<{ preferredLanguage: "en" | "it" }>(
        owner,
        "profiles",
        "PATCH",
        { preferredLanguage: language },
        signal,
      ),
    retry: (failures, error) =>
      failures < 2 &&
      error.name !== "AbortError" &&
      (!(error instanceof CommunityApiError) || error.status >= 500 || error.status === 429),
    onSuccess: async (result, { owner, signal }) => {
      if (signal.aborted) return;
      const key = ["profile", owner.apiUrl, owner.userId];
      const hadPendingRead = client.getQueryState(key)?.fetchStatus === "fetching";
      await client.cancelQueries({ queryKey: key, exact: true });
      if (signal.aborted) return;
      const cached = client.getQueryData<UserProfile>(key);
      if (cached)
        client.setQueryData<UserProfile>(key, {
          ...cached,
          preferredLanguage: result.preferredLanguage,
        });
      else if (hadPendingRead) await client.fetchQuery(profileQueryOptions(owner));
    },
  });
  const { mutate } = mutation;
  const { apiUrl, userId, getToken, protectionBypass, enabled } = options;
  useEffect(() => {
    if (enabled === false || !userId || !apiUrl) return;
    const controller = new AbortController();
    mutate({
      owner: { apiUrl, userId, getToken, protectionBypass },
      language: locale,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [apiUrl, userId, getToken, protectionBypass, enabled, locale, mutate]);
  return mutation;
}
