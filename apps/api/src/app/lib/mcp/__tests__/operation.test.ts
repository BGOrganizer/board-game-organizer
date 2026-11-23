import { expect, it, vi } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation";

const origin = "https://api.example.test";
const signal = new AbortController().signal;

it("uses the canonical path, params, body and original query on the API handler", async () => {
  const op = defineOperation({
    name: "edit_table",
    description: "Edit a table",
    path: "/api/events/[eventId]/tables/[tableId]",
    method: "PATCH",
    body: z.object({ name: z.string().trim().min(5) }),
    query: z.object({
      value: z.string().transform(Number),
      count: z.coerce.number(),
      open: z.boolean(),
    }),
    handler: async (request, context) =>
      Response.json({
        url: request.url,
        method: request.method,
        params: await context.params,
        body: await request.json(),
        type: request.headers.get("content-type"),
        token: request.headers.get("authorization"),
      }),
  });
  expect(op).toMatchObject({
    readOnly: false,
    destructive: true,
    inputSchema: { required: ["params", "query", "body"] },
  });
  const result = await op.run(
    origin,
    {
      params: { eventId: "event123", tableId: "table456" },
      query: { value: "003", count: 20, open: true },
      body: { name: " Mesa Uno " },
    },
    signal,
  );
  expect(await result.json()).toEqual({
    url: `${origin}/api/events/event123/tables/table456?value=003&count=20&open=true`,
    method: "PATCH",
    params: { eventId: "event123", tableId: "table456" },
    body: { name: " Mesa Uno " },
    type: "application/json",
    token: null,
  });
});

it("leaves the list section default to the route and passes explicit alternatives", async () => {
  const op = defineOperation({
    name: "list_table_history",
    description: "List your tables",
    path: "/api/tables",
    method: "GET",
    query: z.object({ section: z.enum(["history", "mine"]).optional() }),
    handler: (request) =>
      Response.json({ section: request.nextUrl.searchParams.get("section"), body: request.body }),
  });
  expect(op).toMatchObject({ readOnly: true, destructive: false });
  expect(await (await op.run(origin, {}, signal)).json()).toEqual({
    section: null,
    body: null,
  });
  expect(await (await op.run(origin, { query: { section: "mine" } }, signal)).json()).toEqual({
    section: "mine",
    body: null,
  });
});

it("rejects broken argument shapes and path manipulation without invoking a handler", async () => {
  const handler = vi.fn(() => Response.json({}));
  const op = defineOperation({
    name: "get_group",
    description: "Get a group",
    path: "/api/groups/[groupId]",
    method: "GET",
    handler,
    query: z.object({ list: z.array(z.string()).optional() }),
  });
  for (const args of [
    null,
    {},
    { params: { groupId: "../private" } },
    { params: { groupId: "a%2fb" } },
    { params: { groupId: "group" }, cookie: "user-id=other" },
    { params: { groupId: "group" }, query: { list: ["array"] } },
  ]) {
    expect((await op.run(origin, args, signal)).status).toBe(400);
  }
  expect(handler).not.toHaveBeenCalled();
});

it("allows a defined action without body, params or query", async () => {
  const op = defineOperation({
    name: "action",
    description: "An action",
    path: "/api/action",
    method: "POST",
    handler: (request) => Response.json(request.method),
  });
  expect(await (await op.run(origin, {}, signal)).json()).toBe("POST");
});
