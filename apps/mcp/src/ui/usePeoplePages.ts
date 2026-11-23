import type { App } from "@modelcontextprotocol/ext-apps";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useId } from "react";
import type { z } from "zod";
import { callTool, record } from "./protocol";

export type PeopleResultProps = {
  app: App;
  operation: string;
  data: unknown;
  input?: unknown;
};

type Cursor = string | number | undefined;

type CursorPage = { nextCursor: string | number | null };

export function usePeoplePages<Page extends CursorPage>(
  { app, operation, input, data }: PeopleResultProps,
  schema: z.ZodType<Page>,
) {
  const id = useId();
  const args = record(input) ?? {};
  const query = record(args.query) ?? {};
  const start = query.cursor;
  const initial: Cursor =
    typeof start === "string" || typeof start === "number" ? start : undefined;
  const parsed = schema.safeParse(data);
  const pages = useInfiniteQuery({
    queryKey: ["mcp-people", operation, id],
    initialPageParam: initial,
    initialData: parsed.success ? { pages: [parsed.data], pageParams: [initial] } : undefined,
    enabled: parsed.success,
    maxPages: 2,
    retry: false,
    staleTime: Infinity,
    getNextPageParam: (page, _pages, _pageParam, cursors): Cursor =>
      page.nextCursor !== null && !cursors.includes(page.nextCursor) ? page.nextCursor : undefined,
    queryFn: async ({ pageParam, signal }) => {
      const request = { ...args };
      if (pageParam !== undefined || Object.keys(query).length) {
        request.query = { ...query, ...(pageParam === undefined ? {} : { cursor: pageParam }) };
      }
      return schema.parse(await callTool(app, operation, request, signal));
    },
  });
  return { pages, invalid: !parsed.success };
}

export function internalBgoPath(path: string): boolean {
  const reference = "https://bgo.example.invalid";
  return path.startsWith("/") && URL.parse(path, reference)?.origin === reference;
}
