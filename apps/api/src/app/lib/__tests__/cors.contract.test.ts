import type { NextRequest } from "next/server";
import { expect, expectTypeOf, it } from "vitest";
import { corsJson } from "../cors";

type CorsInit = NonNullable<Parameters<typeof corsJson>[1]>;
const origin = "https://web-cors-contract.vercel.app";
const incoming = () =>
  new Request("https://api.example.test/api/profiles", {
    headers: { origin, Authorization: "Bearer fixture-only" },
  });

it("accepts ordinary response initialization and rejects Request/NextRequest in its place at compile time", () => {
  expectTypeOf<ResponseInit>().toExtend<CorsInit>();
  expectTypeOf<CorsInit>().toExtend<ResponseInit>();
  expectTypeOf<undefined>().toExtend<Parameters<typeof corsJson>[1]>();
  expectTypeOf<Request>().not.toExtend<CorsInit>();
  expectTypeOf<NextRequest>().not.toExtend<CorsInit>();
  expectTypeOf<RequestInit>().not.toExtend<CorsInit>();
  expectTypeOf<Request>().toExtend<NonNullable<Parameters<typeof corsJson>[2]>>();
  expectTypeOf<NextRequest>().toExtend<NonNullable<Parameters<typeof corsJson>[2]>>();
  const profileInit = { headers: { "Cache-Control": "private, no-store" } };
  expectTypeOf(profileInit).toExtend<CorsInit>();
  expectTypeOf({ ...profileInit, status: 401 }).toExtend<CorsInit>();
});

it("keeps default JSON initialization and the existing no-request CORS fallback", async () => {
  const response = corsJson({ ok: true });
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/json");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  await expect(response.json()).resolves.toEqual({ ok: true });
});

it("accepts an omitted init with an explicit incoming request, without copying request authorization", async () => {
  const request = incoming();
  const response = corsJson({ ok: true }, undefined, request);
  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect(response.headers.get("Authorization")).toBeNull();
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  expect(request.headers.get("Authorization")).toBe("Bearer fixture-only");
  await expect(response.json()).resolves.toEqual({ ok: true });
});

it("preserves the profiles custom cache header, status and body while adding origin-specific CORS", async () => {
  const init = { headers: { "Cache-Control": "private, no-store" } };
  const response = corsJson({ error: "Unauthorized" }, { ...init, status: 401 }, incoming());
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  expect(response.headers.get("Authorization")).toBeNull();
  expect(init).toEqual({ headers: { "Cache-Control": "private, no-store" } });
  await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
});

it("retains an ordinary typed ResponseInit and custom response metadata", async () => {
  const init: ResponseInit = { status: 202, statusText: "Queued", headers: { "Retry-After": "3" } };
  const response = corsJson({ queued: true }, init, incoming());
  expect(response.status).toBe(202);
  expect(response.statusText).toBe("Queued");
  expect(response.headers.get("Retry-After")).toBe("3");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  await expect(response.json()).resolves.toEqual({ queued: true });
});
