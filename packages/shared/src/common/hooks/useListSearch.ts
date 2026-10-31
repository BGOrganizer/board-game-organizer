"use client";

import { useEffect, useState } from "react";

/** Local search/filter state only; remote rows remain owned by Query. */
export function useListSearch<Filter extends string>(available: readonly Filter[]) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Filter[]>(() => [...available]);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timer);
  }, [query]);
  return {
    query,
    setQuery,
    search,
    selected,
    toggle: (value: Filter) =>
      setSelected((current) =>
        available.filter((item) =>
          item === value ? !current.includes(item) : current.includes(item),
        ),
      ),
  };
}
