import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { beginOptimisticOperation } from "../../common/optimisticOperation";
import { groupRecordSeed } from "../groupRecordSeed";

const root = ["groups", "https://api.test", "owner"] as const;
const row = { id: "group", name: "Server name" } as GroupRecordResponse;
const list = [...root, "list", "mine"];
const detail = [...root, "detail", row.id];
const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, structuralSharing: false } } });

it("does not inspect lists when the scoped detail is already materialized", () => {
  const client = makeClient();
  client.setQueryData(detail, row);
  const scan = vi.spyOn(client, "getQueriesData");
  expect(groupRecordSeed(client, root, row.id)).toBeUndefined();
  expect(scan).not.toHaveBeenCalled();
});
it("returns no seed for absent and unmaterialized ordinary lists", () => {
  const client = makeClient();
  expect(groupRecordSeed(client, root, row.id)).toBeUndefined();
  client.getQueryCache().build(client, { queryKey: list });
  client.setQueryData([...root, "list", "public"], { pages: [{ items: [] }] });
  expect(groupRecordSeed(client, root, row.id)).toBeUndefined();
});
it("excludes moderation, detail, foreign API and foreign user data", () => {
  const client = makeClient();
  for (const key of [
    [...root, "list", "moderation"],
    [...root, "detail", "another"],
    ["groups", "https://other.test", "owner", "list", "mine"],
    ["groups", "https://api.test", "another", "list", "mine"],
  ])
    client.setQueryData(key, { pages: [{ items: [row] }] });
  expect(groupRecordSeed(client, root, row.id)).toBeUndefined();
});
it("walks ordinary pages only until the first match without reading later retained pages", () => {
  const client = makeClient();
  const late = vi.fn(() => [row]);
  const data = {
    pages: [
      { items: [{ ...row, id: "another" }] },
      { items: [row] },
      {
        get items() {
          return late();
        },
      },
    ],
  };
  client.setQueryData(list, data);
  expect(groupRecordSeed(client, root, row.id)).toEqual({ row, key: list });
  expect(late).not.toHaveBeenCalled();
  expect(client.getQueryData(list)).toBe(data);
});
it("seeds the authoritative base rather than an unacknowledged optimistic projection", async () => {
  const client = makeClient();
  client.setQueryData(list, { pages: [{ items: [row] }] });
  const projection = { ...row, name: "Unsaved name" };
  const operation = await beginOptimisticOperation(
    client,
    [...root, "write", row.id],
    { queryKey: list, exact: true },
    () => ({ pages: [{ items: [projection] }] }),
  );
  expect(client.getQueryData(list)).toEqual({ pages: [{ items: [projection] }] });
  expect(groupRecordSeed(client, root, row.id)).toEqual({ row, key: list });
  operation.commit();
});
