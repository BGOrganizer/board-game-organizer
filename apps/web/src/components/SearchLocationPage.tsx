"use client";

import type { MatchLocation } from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, MapPin } from "lucide-react";
import type mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

type Result = Pick<MatchLocation, "address" | "longitude" | "latitude"> & { id: string };

export function SearchLocationPage({
  apiUrl,
  getToken,
  protectionBypass,
  initial,
  onSelect,
  onClose,
}: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  protectionBypass?: string;
  initial?: MatchLocation;
  onSelect: (location: MatchLocation) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [name, setName] = useState(initial?.name ?? "");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Result | null>(initial ? { ...initial } : null);
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token || !mapNode.current) return;
    let alive = true;
    void import("mapbox-gl")
      .then(({ default: mapbox }) => {
        if (!alive || !mapNode.current) return;
        mapbox.accessToken = token;
        const instance = new mapbox.Map({
          container: mapNode.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: initial ? [initial.longitude, initial.latitude] : [0, 20],
          zoom: initial ? 13 : 1.5,
        });
        map.current = instance;
        if (initial)
          marker.current = new mapbox.Marker()
            .setLngLat([initial.longitude, initial.latitude])
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
        setResults(body.items.slice(0, 5));
        setError("");
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
    setSelected(result);
    setResults([]);
    setQuery(result.address);
    map.current?.flyTo({ center: [result.longitude, result.latitude], zoom: 14 });
    void import("mapbox-gl").then(({ default: mapbox }) => {
      if (!map.current) return;
      marker.current?.remove();
      marker.current = new mapbox.Marker()
        .setLngLat([result.longitude, result.latitude])
        .addTo(map.current);
    });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setError(t`Location unavailable`);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => map.current?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 14 }),
      () => setError(t`Location permission denied`),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <Button isIconOnly variant="secondary" aria-label={t`Back`} onPress={onClose}>
        <ArrowLeft />
      </Button>
      <h2 className="text-lg font-semibold">{t`Select location`}</h2>
      <label className="block">
        {t`Location name`}
        <input
          className="mt-1 w-full rounded-lg border p-3"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="block">
        {t`Search address`}
        <input
          className="mt-1 w-full rounded-lg border p-3"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
            setResults([]);
          }}
        />
      </label>
      {searching && <Skeleton className="h-12 w-full rounded-lg" />}
      {results.length > 0 && (
        <ul aria-label={t`Address results`} className="rounded-lg border">
          {results.map((result) => (
            <li key={result.id}>
              <Button
                variant="tertiary"
                className="w-full justify-start"
                onPress={() => choose(result)}
              >
                {result.address}
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
      <div
        ref={mapNode}
        role="img"
        aria-label={t`Location map`}
        className="h-72 w-full rounded-lg bg-default-100"
      />
      {!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && <p role="alert">{t`Map unavailable`}</p>}
      <Button variant="secondary" onPress={locate}>
        <MapPin />
        {t`Use my location`}
      </Button>
      {selected && <p>{selected.address}</p>}
      <Button
        variant="primary"
        isDisabled={
          !process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || !selected || name.trim().length < 4
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
      >{t`Confirm location`}</Button>
    </div>
  );
}
