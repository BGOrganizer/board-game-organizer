"use client";

import type { MatchLocation } from "@board-game-organizer/schemas";
import {
  type FavoriteLocationsState,
  formatLocationAddress,
  useCurrentLocationAddress,
  withProtectionBypass,
} from "@board-game-organizer/shared";
import {
  Button,
  Input,
  Label,
  ListBox,
  SearchField,
  Select,
  Skeleton,
  TextField,
} from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { Map as MapTilerMap, Marker as MapTilerMarker } from "@maptiler/sdk";
import { ArrowLeft, Check, Heart, LocateFixed, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "@maptiler/sdk/dist/maptiler-sdk.css";

type Result = Pick<MatchLocation, "address" | "longitude" | "latitude"> & { id: string };

export function SearchLocationPage({
  apiUrl,
  getToken,
  userId,
  protectionBypass,
  initial,
  favorites,
  onSelect,
  onClose,
}: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId?: string | null;
  protectionBypass?: string;
  initial?: MatchLocation;
  favorites: Pick<FavoriteLocationsState, "items"> & {
    list: Pick<
      FavoriteLocationsState["list"],
      "isPending" | "isError" | "hasNextPage" | "isFetchingNextPage" | "fetchNextPage"
    >;
  };
  onSelect: (location: MatchLocation) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [name, setName] = useState(initial?.name ?? "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Result | null>(initial ? { ...initial } : null);
  const selectedRef = useRef<Result | null>(selected);
  const [favoriteKey, setFavoriteKey] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);
  const { lookup, cancel } = useCurrentLocationAddress({
    apiUrl,
    getToken,
    userId,
    protectionBypass,
  });
  useEffect(
    () => () => {
      locationRequest.current++;
    },
    [],
  );
  const cancelLocate = () => {
    locationRequest.current++;
    cancel();
    setLocating(false);
  };
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<MapTilerMap | null>(null);
  const marker = useRef<MapTilerMarker | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
    if (!key || !mapNode.current) return;
    let alive = true;
    void import("@maptiler/sdk")
      .then((maptiler) => {
        if (!alive || !mapNode.current) return;
        maptiler.config.apiKey = key;
        const instance = new maptiler.Map({
          container: mapNode.current,
          style: maptiler.MapStyle.STREETS,
          center: initial ? [initial.longitude, initial.latitude] : [0, 20],
          zoom: initial ? 13 : 1.5,
        });
        map.current = instance;
        if (selectedRef.current)
          marker.current = new maptiler.Marker()
            .setLngLat([selectedRef.current.longitude, selectedRef.current.latitude])
            .addTo(instance);
      })
      .catch(() => setError(t`Could not load map`));
    return () => {
      alive = false;
      marker.current?.remove();
      map.current?.remove();
      map.current = null;
    };
  }, [initial, t]);

  useEffect(() => {
    if (query.trim().length < 4 || selected?.address === query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Unauthorized");
        const url = withProtectionBypass(
          `${apiUrl}/api/locations/search?query=${encodeURIComponent(query.trim())}`,
          protectionBypass,
        );
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Geocoding unavailable");
        const body = (await response.json()) as { items: Result[] };
        if (!controller.signal.aborted) {
          setResults(body.items.slice(0, 5));
          setError("");
        }
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(t`Could not search addresses`);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected?.address, apiUrl, getToken, protectionBypass, t]);

  const choose = (result: Result) => {
    cancelLocate();
    selectedRef.current = result;
    setSelected(result);
    setFavoriteKey(null);
    setResults([]);
    setQuery(result.address);
    map.current?.flyTo({ center: [result.longitude, result.latitude], zoom: 14 });
    void import("@maptiler/sdk").then((maptiler) => {
      if (!map.current || selectedRef.current !== result) return;
      marker.current?.remove();
      marker.current = new maptiler.Marker()
        .setLngLat([result.longitude, result.latitude])
        .addTo(map.current);
    });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setError(t`Location unavailable`);
      return;
    }
    cancelLocate();
    const requestId = locationRequest.current;
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (requestId !== locationRequest.current) return;
        try {
          map.current?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 14 });
          selectedRef.current = null;
          marker.current?.remove();
          marker.current = null;
          setSelected(null);
          setFavoriteKey(null);
          setResults([]);
          setQuery("");
          const address = await lookup(coords.longitude, coords.latitude);
          if (requestId === locationRequest.current) choose(address);
        } catch {
          if (requestId === locationRequest.current) setError(t`Could not search addresses`);
        } finally {
          if (requestId === locationRequest.current) setLocating(false);
        }
      },
      () => {
        if (requestId !== locationRequest.current) return;
        setError(t`Location permission denied`);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button isIconOnly variant="secondary" aria-label={t`Back`} onPress={onClose}>
          <ArrowLeft />
        </Button>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MapPin aria-hidden="true" className="h-5 w-5" />
          {t`Select location`}
        </h2>
      </div>
      <div
        ref={mapNode}
        role="img"
        aria-label={t`Location map`}
        className="h-72 w-full rounded-lg bg-default-100"
      />
      {!process.env.NEXT_PUBLIC_MAPTILER_API_KEY && <p role="alert">{t`Map unavailable`}</p>}
      <TextField fullWidth value={name} onChange={setName}>
        <Label className="flex items-center gap-2">
          <MapPin aria-hidden="true" className="size-4" />
          {t`Location name`}
        </Label>
        <Input name="locationName" autoComplete="off" maxLength={120} />
      </TextField>
      {favorites.list.isPending ? (
        <Skeleton className="h-12 w-full rounded-lg" />
      ) : (
        <Select
          fullWidth
          placeholder={
            favorites.list.isError || favorites.items.length
              ? t`Select a favorite location`
              : t`No favorite locations`
          }
          value={favoriteKey}
          isDisabled={!favorites.items.length}
          onChange={(value) => {
            const item = favorites.items.find((item) => item.key === value);
            if (!item) return;
            choose(item.location);
            setFavoriteKey(item.key);
            setName(item.location.name);
          }}
        >
          <Label className="flex items-center gap-2">
            <Heart className="size-4" aria-hidden="true" />
            {t`Favorite locations`}
          </Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox
              aria-label={t`Favorite locations`}
              className="max-h-64 overflow-y-auto"
              onScroll={(event) => {
                const list = event.currentTarget;
                if (
                  list.scrollHeight - list.scrollTop - list.clientHeight < 64 &&
                  favorites.list.hasNextPage &&
                  !favorites.list.isFetchingNextPage &&
                  !favorites.list.isError
                )
                  void favorites.list.fetchNextPage();
              }}
            >
              {favorites.items.map(({ key, location }) => (
                <ListBox.Item
                  key={key}
                  id={key}
                  textValue={`${location.name} · ${location.address}`}
                  className="[content-visibility:auto] [contain-intrinsic-size:4rem]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{location.name}</p>
                    <p
                      className="line-clamp-2 break-words text-sm text-default-500"
                      title={location.address}
                    >
                      {formatLocationAddress(location.address)}
                    </p>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
            {favorites.list.isFetchingNextPage && <Skeleton className="h-12 w-full rounded-xl" />}
            {favorites.list.isError && (
              <p role="alert" className="text-danger">{t`Could not load favorite locations`}</p>
            )}
          </Select.Popover>
        </Select>
      )}
      {favorites.list.hasNextPage && (
        <Button
          size="sm"
          variant="secondary"
          isDisabled={favorites.list.isFetchingNextPage}
          onPress={() => void favorites.list.fetchNextPage()}
        >{t`Load more favorite locations`}</Button>
      )}
      {favorites.list.isError && (
        <p role="alert" className="text-danger">{t`Could not load favorite locations`}</p>
      )}
      <SearchField
        fullWidth
        value={query}
        onChange={(value) => {
          cancelLocate();
          setQuery(value);
          selectedRef.current = null;
          marker.current?.remove();
          marker.current = null;
          setSelected(null);
          setFavoriteKey(null);
          setResults([]);
        }}
      >
        <Label>{t`Search address`}</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input
            className="min-w-0"
            name="address"
            autoComplete="off"
            placeholder={t`Search address`}
          />
          <SearchField.ClearButton aria-label={t`Clear search`} />
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Center map on my location`}
            className="mr-1 shrink-0"
            isDisabled={locating}
            onPress={locate}
          >
            <LocateFixed className="size-5" aria-hidden="true" />
          </Button>
        </SearchField.Group>
      </SearchField>
      {(searching || locating) && <Skeleton className="h-12 w-full rounded-lg" />}
      {results.length > 0 && (
        <ul aria-label={t`Address results`} className="rounded-lg border">
          {results.map((result) => (
            <li key={result.id}>
              <Button
                variant="tertiary"
                className="h-auto w-full justify-start whitespace-normal text-left"
                aria-label={result.address}
                onPress={() => choose(result)}
              >
                {formatLocationAddress(result.address)}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        isDisabled={
          locating ||
          !process.env.NEXT_PUBLIC_MAPTILER_API_KEY ||
          !selected ||
          name.trim().length < 4
        }
        onPress={() => {
          if (selected && name.trim().length >= 4)
            onSelect({
              id: initial?.id ?? crypto.randomUUID(),
              name: name.trim(),
              address: selected.address,
              longitude: selected.longitude,
              latitude: selected.latitude,
            });
        }}
      >
        <Check aria-hidden="true" className="size-5" />
        {t`Confirm location`}
      </Button>
    </div>
  );
}
