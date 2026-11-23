import type { McpTool } from "@board-game-organizer/mcp";
import { NextRequest } from "next/server";
import { z } from "zod";

type ParameterNames<Path extends string> = Path extends `${string}[${infer Name}]${infer Rest}`
  ? Name | ParameterNames<Rest>
  : never;

type PathParams<Path extends string> = Record<ParameterNames<Path>, string>;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type OperationDefinition<Path extends string> = {
  name: string;
  description: string;
  path: Path;
  method: Method;
  handler: (
    request: NextRequest,
    context: { params: Promise<PathParams<Path>> },
  ) => Response | Promise<Response>;
  query?: z.ZodType;
  body?: z.ZodType;
  sensitive?: boolean;
};

export type ApiOperation = McpTool & {
  method: Method;
  path: string;
  run: (origin: string, args: unknown, signal: AbortSignal) => Promise<Response>;
};

// Dot segments and decoded separators cannot select a different route or resource.
const pathParam = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9_:-]+$/);
const queryValue = z.union([z.string(), z.number(), z.boolean()]);
const rawQuery = z.record(z.string(), queryValue);
export function defineOperation<const Path extends string>(
  definition: OperationDefinition<Path>,
): ApiOperation {
  const { path, method, query, body, sensitive, name, description, handler } = definition;
  const paramNames = Array.from(path.matchAll(/\[([^\]]+)\]/g), (part) => part[1]);
  const paramsSchema = z.strictObject(
    Object.fromEntries(paramNames.map((key) => [key, pathParam])),
  );
  const queryField = query?.safeParse({}).success ? query.optional() : query;
  const argsSchema = z.strictObject({
    ...(paramNames.length ? { params: paramsSchema } : {}),
    ...(queryField ? { query: queryField } : {}),
    ...(body ? { body } : {}),
  });
  const inputSchema = z.toJSONSchema(argsSchema, { io: "input", unrepresentable: "any" });

  return {
    name,
    description,
    path,
    method,
    sensitive,
    readOnly: method === "GET",
    // PATCH, PUT and POST also include removals/replacements on current BGO routes.
    destructive: method !== "GET",
    inputSchema: { ...inputSchema, type: "object" },
    async run(origin, args, signal) {
      const parsed = argsSchema.safeParse(args);
      const original = args as { params?: PathParams<Path>; query?: unknown; body?: unknown };
      const values = rawQuery.safeParse(original?.query ?? {});
      if (!parsed.success || !values.success) {
        return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
      }

      // Some API query schemas transform URL strings. Pass the original values on to the route.
      const params = (original.params ?? {}) as PathParams<Path>;
      const resolved = path.replace(/\[([^\]]+)\]/g, (_, key: keyof PathParams<Path>) =>
        encodeURIComponent(params[key]),
      );
      const url = new URL(resolved, origin);
      for (const [key, value] of Object.entries(values.data)) {
        url.searchParams.set(key, String(value));
      }
      const request = new NextRequest(url, {
        method,
        signal,
        ...(body
          ? { body: JSON.stringify(original.body), headers: { "Content-Type": "application/json" } }
          : {}),
      });
      return handler(request, { params: Promise.resolve(params) });
    },
  };
}
