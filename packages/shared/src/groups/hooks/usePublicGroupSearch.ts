"use client";

import { defaultGroupDiscoveryRadiusKm } from "@board-game-organizer/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import { useListSearch } from "../../common/hooks/useListSearch";
import type { CommunityApiOptions } from "../../community/communityApi";
import { type GroupDiscoveryPosition, useGroupRecords } from "./useGroupRecords";

const noRoleFilters = [] as const;

export function usePublicGroupSearch(
  options: CommunityApiOptions,
  requestPosition: () => Promise<GroupDiscoveryPosition | null>,
) {
  const { query, setQuery, search } = useListSearch(noRoleFilters, 1);
  const [active, setActive] = useState(false);
  const [friends, setFriends] = useState(true);
  const [position, setPosition] = useState<GroupDiscoveryPosition>();
  const [radiusKm, setRadiusKm] = useState(defaultGroupDiscoveryRadiusKm);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const request = useRef(0);

  const trimmed = query.trim();
  const waitingForQuery = Boolean(trimmed && trimmed !== search);
  const list = useGroupRecords(
    { ...options, enabled: options.enabled !== false && !waitingForQuery },
    "public",
    trimmed && search === trimmed ? search : "",
    undefined,
    undefined,
    undefined,
    { friends, position, radiusKm },
  );

  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const open = useCallback(() => setActive(true), []);
  const close = useCallback(() => {
    request.current += 1;
    setActive(false);
    setQuery("");
    setFriends(true);
    setPosition(undefined);
    setLocating(false);
    setLocationError(false);
  }, [setQuery]);
  const toggleFriends = useCallback(() => {
    setActive(true);
    setFriends((current) => !current);
  }, []);
  const toggleNearby = useCallback(async () => {
    setActive(true);
    setLocationError(false);
    const id = ++request.current;
    if (position || locating) {
      setPosition(undefined);
      setLocating(false);
      return;
    }

    setLocating(true);
    const result = await Promise.resolve()
      .then(requestPosition)
      .catch(() => null);
    if (request.current !== id) return;
    setLocating(false);
    if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
      setLocationError(true);
      return;
    }
    // Nearby search needs neighbourhood-level precision and never stores a raw position.
    setPosition({
      latitude: Number(result.latitude.toFixed(3)),
      longitude: Number(result.longitude.toFixed(3)),
    });
  }, [locating, position, requestPosition]);

  return {
    query,
    setQuery,
    active,
    open,
    close,
    friends,
    toggleFriends,
    nearby: Boolean(position),
    radiusKm,
    setRadiusKm,
    toggleNearby,
    locating,
    locationError,
    list: waitingForQuery
      ? { ...list, items: [], hasNextPage: false, isPending: true, isError: false }
      : list,
  };
}
