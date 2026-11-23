import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { operations } from "../operations";

const api = new URL("../../../api/", import.meta.url);
const outsideUserApi =
  /^(?:admin\/|webhooks\/|health\/|inngest\/|event-bookings\/|group-invitations\/|matches\/|match-invitations\/|organization-assets\/|organizations\/)|\/tables\/\[tableId\]\/bookings\//;

it("keeps every active user-facing API method available through its own tool", () => {
  const currentRoutes = readdirSync(api, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith("/route.ts") && !outsideUserApi.test(file))
    .flatMap((file) => {
      const source = readFileSync(new URL(file, api), "utf8");
      return [
        ...source.matchAll(/^export (?:async )?(?:function|const) (GET|POST|PATCH|PUT|DELETE)\b/gm),
      ].map((match) => `${match[1]} /api/${file.slice(0, -9)}`);
    });
  const registered = operations.map(({ method, path }) => `${method} ${path}`);
  expect(registered.toSorted()).toEqual(currentRoutes.toSorted());
  expect(new Set(operations.map(({ name }) => name)).size).toBe(operations.length);
  expect(registered.length).toBeGreaterThan(100);
});

it("keeps private native inputs in app-only tool declarations", () => {
  expect(
    operations
      .filter(({ sensitive }) => sensitive)
      .map(({ name }) => name)
      .toSorted(),
  ).toEqual([
    "register_push_subscription",
    "remove_push_subscription",
    "sync_contacts",
    "upload_group_logo_chunk",
  ]);
});
