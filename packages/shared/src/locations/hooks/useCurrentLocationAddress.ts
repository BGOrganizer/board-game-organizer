"use client";

import { type MatchLocation, matchLocationSchema } from "@board-game-organizer/schemas";
import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { withProtectionBypass } from "../../common/api";

type Address = Pick<MatchLocation, "address" | "longitude" | "latitude"> & { id: string };
interface Options {
  apiUrl: string;
  userId: string | null | undefined;
  getToken: () => Promise<string | null>;
  protectionBypass?: string;
}

const coordinatesSchema = matchLocationSchema.pick({ longitude: true, latitude: true });

export function currentLocationAddressQuery(options: Options, longitude: number, latitude: number) {
  const coordinates = coordinatesSchema.parse({ longitude, latitude });
  return queryOptions({
    queryKey: ["locations", "reverse", options.apiUrl, options.userId, longitude, latitude],
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }): Promise<Address> => {
      const token = await options.getToken();
      if (!token) throw new Error("Unauthorized");
      const query = encodeURIComponent(
        `${coordinates.longitude.toFixed(7)},${coordinates.latitude.toFixed(7)}`,
      );
      const response = await fetch(
        withProtectionBypass(
          `${options.apiUrl}/api/locations/search?query=${query}`,
          options.protectionBypass,
        ),
        { headers: { Authorization: `Bearer ${token}` }, signal },
      );
      if (!response.ok) throw new Error("Geocoding unavailable");
      const { items } = (await response.json()) as { items: Address[] };
      if (!items[0]) throw new Error("No address found");
      return items[0];
    },
  });
}

export function useCurrentLocationAddress(options: Options) {
  const client = useQueryClient();
  const activeKey = useRef<readonly unknown[] | null>(null);
  const cancel = useCallback(() => {
    if (activeKey.current) void client.cancelQueries({ queryKey: activeKey.current, exact: true });
  }, [client]);
  useEffect(() => cancel, [cancel]);
  return {
    lookup: (longitude: number, latitude: number) => {
      const query = currentLocationAddressQuery(options, longitude, latitude);
      activeKey.current = query.queryKey;
      return client.fetchQuery(query);
    },
    cancel,
  };
}
