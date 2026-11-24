import type { McpPresentation, McpTool } from "@board-game-organizer/mcp";
import { z } from "zod";
import {
  eventListQuery,
  eventTablesQuery,
  groupListQuery,
  recordPageQuery,
} from "../community/record-query";
import { operations } from "./operations";

const groupReference = z.strictObject({ kind: z.literal("group"), id: z.uuid() });
const eventReference = z.strictObject({ kind: z.literal("event"), id: z.uuid() });
const tableReference = z.strictObject({
  kind: z.literal("table"),
  id: z.uuid(),
  eventId: z.uuid(),
});
const reference = z.discriminatedUnion("kind", [groupReference, eventReference, tableReference]);

const browse = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("list_events"), query: eventListQuery.optional() }),
  z.strictObject({ source: z.literal("list_groups"), query: groupListQuery.optional() }),
  z.strictObject({
    source: z.literal("discover_groups"),
    query: recordPageQuery.required({ query: true }),
  }),
  z.strictObject({
    source: z.literal("list_event_tables"),
    params: z.strictObject({ eventId: z.uuid() }),
    query: eventTablesQuery.optional(),
  }),
]);

const input = z.strictObject({
  mode: z.enum(["browse", "selection"]),
  records: z.array(reference).min(1).max(8).optional(),
  list: browse.optional(),
});

export const showRecordsTool: McpTool = {
  name: "show_bgo_records",
  description:
    "Show interactive BGO cards when the user wants to browse groups, events or event tables. For mode browse, pass list with a source and its usual arguments. For mode selection, pass records found with BGO read tools, supplying up to eight IDs in display order and the parent event ID for each table. One selection can include all three record kinds.",
  inputSchema: {
    ...z.toJSONSchema(input, { io: "input", unrepresentable: "any" }),
    type: "object",
  },
  readOnly: true,
  presentation: "selection",
};

const reads = new Map(
  operations.filter((operation) => operation.readOnly).map((op) => [op.name, op]),
);
const pageSchema = z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable() });

function invalidInput() {
  return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
}

function read(name: string, origin: string, args: unknown, signal: AbortSignal) {
  const operation = reads.get(name);
  if (!operation) throw new Error(`Missing MCP record reader: ${name}`);
  return operation.run(origin, args, signal);
}

export async function showRecords(
  origin: string,
  args: unknown,
  signal: AbortSignal,
): Promise<McpPresentation | Response> {
  const parsed = input.safeParse(args);
  if (!parsed.success) return invalidInput();
  const { mode, list, records } = parsed.data;

  if (mode === "browse") {
    if (!list || records) return invalidInput();
    // Pass the original query because the canonical readers parse their URL query values.
    const { source, ...listArgs } = (args as { list: z.input<typeof browse> }).list;
    const result = await read(source, origin, listArgs, signal);
    if (!result.ok) return result;
    const page = pageSchema.parse(await result.json());
    return {
      summary: { count: page.items.length, hasMore: page.nextCursor !== null },
      view: { mode: "browse", operation: source, input: listArgs, page },
    };
  }

  if (!records || list) return invalidInput();
  const rows = [];
  const unique = new Set<string>();
  for (const item of records) {
    const key =
      item.kind === "table" ? `table:${item.eventId}:${item.id}` : `${item.kind}:${item.id}`;
    if (unique.has(key)) continue;
    unique.add(key);
    signal.throwIfAborted();
    const params =
      item.kind === "group"
        ? { groupId: item.id }
        : item.kind === "event"
          ? { eventId: item.id }
          : { eventId: item.eventId, tableId: item.id };
    const result = await read(`get_${item.kind}`, origin, { params }, signal);
    if (!result.ok) return result;
    rows.push({ kind: item.kind, data: await result.json() });
  }
  return { summary: { count: rows.length, hasMore: false }, view: { mode: "selection", rows } };
}
