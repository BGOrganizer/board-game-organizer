import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Source call-site ownership, never a React hook invocation counter.
const source = (name: string) =>
  readFileSync(new URL(`../../components/events/${name}.tsx`, import.meta.url), "utf8");

it("keeps one native title owner and places separate tab measurement roots in each retained header", () => {
  expect(source("EventTableOverview")).not.toContain("Stack.Screen");
  const table = source("EventTable");
  expect(table).toContain("<Stack.Screen");
  expect(table).toContain("<Tabs value={selected} onValueChange={setTab}>");
  expect(table).not.toContain("<Tabs value={selected} onValueChange={setTab} style={{ flex: 1 }}>");
  const seats = source("EventTableSeats");
  expect(seats.match(/useTableSeatOrder\(/g)).toHaveLength(1);
  expect(seats.match(/useEventTableRoster\(/g)).toHaveLength(1);
  expect(seats).not.toContain("if (order.editing)\n    return");
});
