import type { App } from "@modelcontextprotocol/ext-apps";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useId } from "react";
import { callTool, record } from "./protocol";

type ToolPage<Item> = { items: Item[]; nextCursor?: string | null };

export function useToolPages<Item>(
  app: App,
  operation: string,
  input: unknown,
  first: ToolPage<Item> | undefined,
  parse: (data: unknown) => ToolPage<Item>,
) {
  const instance = useId();
  const options = record(input);
  const query = record(options?.query);
  const initialPageParam = typeof query?.cursor === "string" ? query.cursor : null;
  return useInfiniteQuery({
    queryKey: ["mcp-result-pages", operation, instance],
    enabled: Boolean(first),
    initialPageParam,
    initialData: first ? { pages: [first], pageParams: [initialPageParam] } : undefined,
    staleTime: Infinity,
    queryFn: async ({ pageParam, signal }) =>
      parse(
        await callTool(
          app,
          operation,
          pageParam === null
            ? { ...options }
            : { ...options, query: { ...query, cursor: pageParam } },
          signal,
        ),
      ),
    getNextPageParam: (page, _pages, _cursor, cursors) =>
      !page.nextCursor || cursors.includes(page.nextCursor) ? undefined : page.nextCursor,
  });
}
