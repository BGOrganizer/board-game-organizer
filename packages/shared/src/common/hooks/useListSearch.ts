"use client";

import { useCallback, useEffect, useState } from "react";

/** Local search/filter state only; remote rows remain owned by Query. */
export function useListSearch<Filter extends string>(available: readonly Filter[], minLength = 4) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Filter[]>(() => [...available]);
  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(query.trim().length >= minLength ? query.trim() : ""),
      300,
    );
    return () => clearTimeout(timer);
  }, [query, minLength]);
  const toggle = useCallback(
    (value: Filter) =>
      setSelected((current) =>
        available.filter((item) =>
          item === value ? !current.includes(item) : current.includes(item),
        ),
      ),
    [available],
  );
  const reset = useCallback(() => {
    setQuery("");
    setSearch("");
    setSelected([...available]);
  }, [available]);
  return {
    query,
    setQuery,
    search,
    selected,
    toggle,
    reset,
  };
}
