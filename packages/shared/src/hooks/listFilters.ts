import { useEffect, useState } from "react";

export type ListRole = "admin" | "invited" | "accepted";
export const listRoles: ListRole[] = ["admin", "invited", "accepted"];

export interface ListFilters {
  query: string;
  roles: ListRole[];
  limit: number;
}

export function useListFilters() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [roles, setRoles] = useState<ListRole[]>(listRoles);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timer);
  }, [query]);
  return {
    query,
    setQuery,
    roles,
    toggleRole: (role: ListRole) =>
      setRoles((current) =>
        current.includes(role)
          ? current.filter((item) => item !== role)
          : listRoles.filter((item) => item === role || current.includes(item)),
      ),
    filters: { query: debounced, roles, limit: 20 },
  };
}

export function listPagePath(path: string, filters: ListFilters, cursor: string) {
  const params = new URLSearchParams({
    limit: String(filters.limit),
    roles: filters.roles.join(","),
    ...(filters.query ? { query: filters.query } : {}),
    ...(cursor ? { cursor } : {}),
  });
  return `${path}?${params}`;
}

export function filterPagedRows<
  T extends {
    name: string;
    adminUserId: string;
    invitations: Array<{ inviteeUserId: string; status: string }>;
  },
>(rows: T[], userId: string | null | undefined, queryKey: readonly unknown[]): T[] {
  const name = String(queryKey[4] ?? "").toLocaleLowerCase();
  const roles = String(queryKey[5] ?? "").split(",");
  return rows.filter((row) => {
    const invitation = row.invitations.find((item) => item.inviteeUserId === userId);
    const role =
      row.adminUserId === userId
        ? "admin"
        : invitation?.status === "PENDING"
          ? "invited"
          : invitation?.status === "ACCEPTED"
            ? "accepted"
            : "";
    return roles.includes(role) && row.name.toLocaleLowerCase().includes(name);
  });
}

export function patchPagedList<T>(
  data: unknown,
  field: "matches" | "groups",
  patch: (rows: T[], pageIndex: number) => T[],
): unknown {
  if (!data || typeof data !== "object" || !("pages" in data) || !Array.isArray(data.pages))
    return data;
  return {
    ...data,
    pages: data.pages.map((page, pageIndex) =>
      page && typeof page === "object" && field in page
        ? { ...page, [field]: patch((page as Record<string, T[]>)[field] ?? [], pageIndex) }
        : page,
    ),
  };
}
