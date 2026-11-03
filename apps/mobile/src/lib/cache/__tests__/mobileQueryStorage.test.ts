import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stores: new Map<string, Map<string, string>>(),
  keys: new Map<string, string>(),
  configurations: [] as Record<string, unknown>[],
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: vi.fn((config: Record<string, unknown>) => {
    const id = String(config.id);
    state.configurations.push(config);
    if (!state.stores.has(id)) state.stores.set(id, new Map());
    const data = state.stores.get(id)!;
    return {
      getString: (key: string) => data.get(key),
      set: (key: string, value: string) => data.set(key, value),
      remove: (key: string) => data.delete(key),
    };
  }),
  deleteMMKV: vi.fn((id: string) => state.stores.delete(id)),
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) =>
    value.includes("user-b") ? "owner-b" : value.includes("other-api") ? "other-api" : "owner-a",
  ),
  getRandomBytesAsync: vi.fn(
    async () => new Uint8Array(Array.from({ length: 32 }, (_, index) => index)),
  ),
}));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  getItemAsync: vi.fn(async (id: string) => state.keys.get(id) ?? null),
  setItemAsync: vi.fn(async (id: string, key: string) => {
    state.keys.set(id, key);
  }),
  deleteItemAsync: vi.fn(async (id: string) => {
    state.keys.delete(id);
  }),
}));

import { getRandomBytesAsync } from "expo-crypto";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import { deleteMMKV } from "react-native-mmkv";
import { openMobileQueryStorage, purgeMobileQueryStorage } from "../mobileQueryStorage";

const a = { apiUrl: "api", userId: "user-a" },
  b = { apiUrl: "api", userId: "user-b" };
const current = () => true;
beforeEach(async () => {
  await purgeMobileQueryStorage();
  state.keys.clear();
  state.configurations.length = 0;
  vi.clearAllMocks();
});
it("uses encrypted account/API namespaces, native randomness and device-only SecureStore; reuses its key", async () => {
  const first = await openMobileQueryStorage(a, current);
  first!.set("queries", "data");
  const config = state.configurations.at(-1)!;
  expect(config).toMatchObject({
    id: "bgo.cache.owner-a",
    encryptionType: "AES-256",
    recoveryStrategy: "discard-on-error",
  });
  expect(String(config.encryptionKey)).toHaveLength(32);
  expect(setItemAsync).toHaveBeenCalledWith("bgo.cache.owner-a", config.encryptionKey, {
    keychainAccessible: "device-only",
  });
  const second = await openMobileQueryStorage(a, current);
  expect(second!.getString("queries")).toBe("data");
  expect(getRandomBytesAsync).toHaveBeenCalledTimes(1);
  expect(state.configurations.at(-1)!.encryptionKey).toBe(config.encryptionKey);
});
it("purges disk and key on logout and isolates next account/API", async () => {
  (await openMobileQueryStorage(a, current))!.set("queries", "a-private");
  const next = await openMobileQueryStorage(b, current);
  expect(next!.getString("queries")).toBeUndefined();
  expect(state.keys.has("bgo.cache.owner-a")).toBe(false);
  await purgeMobileQueryStorage();
  expect(state.stores.has("bgo.cache.owner-b")).toBe(false);
  expect(state.keys.has("bgo.cache.owner-b")).toBe(false);
  await openMobileQueryStorage({ ...a, apiUrl: "other-api" }, current);
  expect(state.configurations.at(-1)!.id).toBe("bgo.cache.other-api");
});
it("discards encrypted backup if its key is missing; never opens it as plaintext", async () => {
  (await openMobileQueryStorage(a, current))!.set("queries", "old-private");
  state.keys.clear();
  const reopened = await openMobileQueryStorage(a, current);
  expect(reopened!.getString("queries")).toBeUndefined();
  expect(deleteMMKV).toHaveBeenCalledWith("bgo.cache.owner-a");
});
it("retries interrupted purge before any restore and leaves tombstone on deletion failure", async () => {
  await openMobileQueryStorage(a, current);
  vi.mocked(deleteItemAsync).mockRejectedValueOnce(new Error("locked"));
  await expect(purgeMobileQueryStorage()).rejects.toThrow("locked");
  expect(state.stores.get("bgo.cache-control.v1")!.get("purge")).toBe("bgo.cache.owner-a");
  await openMobileQueryStorage(b, current);
  expect(state.stores.get("bgo.cache-control.v1")!.has("purge")).toBe(false);
  expect(state.keys.has("bgo.cache.owner-a")).toBe(false);
});
it("serializes competing account opens and blocks stale callbacks", async () => {
  let live = true;
  let resolve!: (key: string | null) => void;
  vi.mocked(getItemAsync).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const old = openMobileQueryStorage(a, () => live);
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  const next = openMobileQueryStorage(b, current);
  live = false;
  resolve("old-key");
  expect(await old).toBeUndefined();
  expect(await next).toBeDefined();
  expect(state.configurations.at(-1)!.id).toBe("bgo.cache.owner-b");
  expect(await openMobileQueryStorage(a, () => false)).toBeUndefined();
});
it("does not activate after owner changes during previous-account purge", async () => {
  await openMobileQueryStorage(a, current);
  let live = true;
  vi.mocked(deleteItemAsync).mockImplementationOnce(async () => {
    live = false;
  });
  expect(await openMobileQueryStorage(b, () => live)).toBeUndefined();
  expect(state.stores.get("bgo.cache-control.v1")!.get("owner")).toBeUndefined();
});
it("does not activate after owner changes during random/key creation", async () => {
  for (const stage of ["random", "save"] as const) {
    await purgeMobileQueryStorage();
    let live = true;
    if (stage === "random")
      vi.mocked(getRandomBytesAsync).mockImplementationOnce(async () => {
        live = false;
        return new Uint8Array(32);
      });
    else
      vi.mocked(setItemAsync).mockImplementationOnce(async () => {
        live = false;
      });
    expect(await openMobileQueryStorage(a, () => live)).toBeUndefined();
    expect(state.stores.get("bgo.cache-control.v1")!.get("owner")).toBeUndefined();
  }
});
