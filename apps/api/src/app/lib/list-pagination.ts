import { z } from "zod";

export type ListRole = "admin" | "invited" | "accepted";

const querySchema = z
  .object({
    "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: z
      .string()
      .max(80)
      .regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|[0-9a-f-]{36}$/)
      .optional(),
    query: z.string().trim().min(4).max(120).optional(),
    roles: z
      .string()
      .max(64)
      .regex(/^(admin|invited|accepted)(,(admin|invited|accepted))*$|^$/)
      .optional(),
  })
  .strict();

export function parseListQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) return null;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || (parsed.data.cursor && !parsed.data.limit)) return null;
  return {
    ...parsed.data,
    roles:
      parsed.data.roles === undefined
        ? undefined
        : (parsed.data.roles.split(",").filter(Boolean) as ListRole[]),
  };
}

export function pageNamedList<T extends { id: string; name: string; createdAt: string }>(
  rows: T[],
  options: NonNullable<ReturnType<typeof parseListQuery>>,
  role: (row: T) => ListRole | null,
) {
  // ponytail: enrich authorized rows before paging; move filtering into Mongo when per-user lists grow large.
  const name = options.query?.toLocaleLowerCase();
  const filtered = rows
    .filter(
      (row) =>
        (!name || row.name.toLocaleLowerCase().includes(name)) &&
        (options.roles === undefined || options.roles.includes(role(row) as ListRole)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const cursor = options.cursor;
  const afterCursor = cursor
    ? filtered.filter((row) => `${row.createdAt}|${row.id}` < cursor)
    : filtered;
  const page = afterCursor.slice(0, options.limit ?? afterCursor.length);
  return {
    items: page,
    nextCursor:
      options.limit && afterCursor.length > options.limit
        ? `${page.at(-1)?.createdAt}|${page.at(-1)?.id}`
        : null,
  };
}
