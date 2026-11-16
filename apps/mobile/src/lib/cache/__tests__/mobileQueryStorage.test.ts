import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stores: new Map<string, Map<string, string>>(),
  keys: new Map<string, string>(),
  configurations: [] as Record<string, unknown>[],
  native: new Map<string, { data: Map<string, string>; key: unknown; freed: boolean }>(),
  foreground: [] as Array<() => void>,
  memoryWarning: [] as Array<() => void>,
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: vi.fn((config: Record<string, unknown>) => {
    const id = String(config.id);
    state.configurations.push(config);
    if (!state.stores.has(id)) state.stores.set(id, new Map());
    if (!state.native.has(id))
      state.native.set(id, {
        data: state.stores.get(id)!,
        key: config.encryptionKey,
        freed: false,
      });
    const native = state.native.get(id)!;
    const alive = () => {
      if (native.freed) throw new Error("MMKV native pointer was freed");
    };
    // v4.3.2 retains per-wrapper AppState callbacks after deleteMMKV destroys the native pointer.
    state.foreground.push(alive);
    state.memoryWarning.push(alive);
    return {
      getString: (key: string) => {
        alive();
        return native.data.get(key);
      },
      set: (key: string, value: string) => {
        alive();
        native.data.set(key, value);
      },
      remove: (key: string) => {
        alive();
        return native.data.delete(key);
      },
      clearAll: vi.fn(() => {
        alive();
        native.data.clear();
      }),
      encrypt: vi.fn((key: string, algorithm: string) => {
        alive();
        expect(algorithm).toBe("AES-256");
        native.key = key;
      }),
    };
  }),
  deleteMMKV: vi.fn((id: string) => {
    const native = state.native.get(id);
    if (native) native.freed = true;
    state.native.delete(id);
    state.stores.delete(id);
    return true;
  }),
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
import { createMMKV, deleteMMKV } from "react-native-mmkv";

let openMobileQueryStorage: typeof import("../mobileQueryStorage").openMobileQueryStorage;
let purgeMobileQueryStorage: typeof import("../mobileQueryStorage").purgeMobileQueryStorage;
async function freshRuntime() {
  vi.resetModules();
  state.native.clear();
  state.foreground.length = 0;
  state.memoryWarning.length = 0;
  ({ openMobileQueryStorage, purgeMobileQueryStorage } = await import("../mobileQueryStorage"));
}
function foreground() {
  state.foreground.forEach((callback) => {
    callback();
  });
  state.memoryWarning.forEach((callback) => {
    callback();
  });
}

const a = { apiUrl: "api", userId: "user-a" },
  b = { apiUrl: "api", userId: "user-b" };
const current = () => true;
beforeEach(async () => {
  state.stores.clear();
  state.keys.clear();
  state.configurations.length = 0;
  await freshRuntime();
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
  expect(state.stores.get("bgo.cache.owner-b")!.size).toBe(0);
  expect(state.keys.has("bgo.cache.owner-b")).toBe(false);
  await openMobileQueryStorage({ ...a, apiUrl: "other-api" }, current);
  expect(state.configurations.at(-1)!.id).toBe("bgo.cache.other-api");
});
it("discards encrypted backup if its key is missing; never opens it as plaintext", async () => {
  (await openMobileQueryStorage(a, current))!.set("queries", "old-private");
  state.keys.clear();
  const reopened = await openMobileQueryStorage(a, current);
  expect(reopened!.getString("queries")).toBeUndefined();
  expect(deleteMMKV).toHaveBeenCalledTimes(1); // Only before its first native handle exists.
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

it("keeps native foreground and memory-warning listeners safe immediately after logout", async () => {
  const old = await openMobileQueryStorage(a, current);
  old!.set("queries", "private-a");
  await purgeMobileQueryStorage();
  expect(() => foreground()).not.toThrow();
  expect(old!.getString("queries")).toBeUndefined();
  old!.set("queries", "late-a");
  expect(state.stores.get("bgo.cache.owner-a")?.get("queries")).toBeUndefined();
});
it("switches A -> logout -> B -> logout -> A in one runtime with fresh encrypted keys", async () => {
  const first = await openMobileQueryStorage(a, current);
  first!.set("queries", "private-a");
  const firstKey = state.keys.get("bgo.cache.owner-a");
  await purgeMobileQueryStorage();
  foreground();
  const second = await openMobileQueryStorage(b, current);
  expect(second!.getString("queries")).toBeUndefined();
  second!.set("queries", "private-b");
  await purgeMobileQueryStorage();
  foreground();
  vi.mocked(getRandomBytesAsync).mockResolvedValueOnce(new Uint8Array(32).fill(63));
  const returned = await openMobileQueryStorage(a, current);
  expect(returned!.getString("queries")).toBeUndefined();
  expect(state.keys.get("bgo.cache.owner-a")).not.toBe(firstKey);
  expect(state.native.get("bgo.cache.owner-a")!.key).toBe(state.keys.get("bgo.cache.owner-a"));
  returned!.set("queries", "fresh-a");
  first!.set("queries", "stale-a");
  second!.set("queries", "stale-b");
  expect(first!.getString("queries")).toBeUndefined();
  expect(second!.remove("queries")).toBe(false);
  expect(returned!.getString("queries")).toBe("fresh-a");
  expect(state.configurations.filter((config) => config.id === "bgo.cache.owner-a")).toHaveLength(
    1,
  );
  expect(() => foreground()).not.toThrow();
});

it("revokes a previous lease before asynchronous key-loss recovery", async () => {
  const old = await openMobileQueryStorage(a, current);
  old!.set("queries", "private-a");
  state.keys.clear();
  vi.mocked(getRandomBytesAsync).mockImplementationOnce(async () => {
    old!.set("queries", "late-during-random");
    expect(state.stores.get("bgo.cache.owner-a")!.size).toBe(0);
    return new Uint8Array(32).fill(62);
  });
  vi.mocked(setItemAsync).mockImplementationOnce(async (id, key) => {
    old!.set("queries", "late-during-save");
    expect(old!.getString("queries")).toBeUndefined();
    state.keys.set(id, key);
  });
  const replacement = await openMobileQueryStorage(a, current);
  expect(replacement!.getString("queries")).toBeUndefined();
  replacement!.set("queries", "fresh");
  expect(replacement!.remove("queries")).toBe(true);
  expect(replacement!.getString("queries")).toBeUndefined();
  expect(state.native.get("bgo.cache.owner-a")!.key).toBe(state.keys.get("bgo.cache.owner-a"));
  expect(() => foreground()).not.toThrow();
});
it("physically deletes a cold backup without a key before creating any native handle", async () => {
  state.stores.set("bgo.cache.owner-a", new Map([["queries", "unreadable-backup"]]));
  const storage = await openMobileQueryStorage(a, current);
  expect(storage!.getString("queries")).toBeUndefined();
  expect(deleteMMKV).toHaveBeenCalledWith("bgo.cache.owner-a");
  expect(state.native.get("bgo.cache.owner-a")!.key).toBe(state.keys.get("bgo.cache.owner-a"));
});
it("restores the encrypted owner snapshot on a new process while its key exists", async () => {
  (await openMobileQueryStorage(a, current))!.set("queries", "durable-a");
  await freshRuntime();
  vi.clearAllMocks();
  expect((await openMobileQueryStorage(a, current))!.getString("queries")).toBe("durable-a");
  expect(deleteMMKV).not.toHaveBeenCalled();
});
it("purges a previous-process owner physically, and handles an empty logout", async () => {
  await purgeMobileQueryStorage();
  expect(deleteMMKV).not.toHaveBeenCalled();
  (await openMobileQueryStorage(a, current))!.set("queries", "durable-a");
  await freshRuntime();
  await purgeMobileQueryStorage();
  expect(state.stores.has("bgo.cache.owner-a")).toBe(false);
  expect(state.keys.has("bgo.cache.owner-a")).toBe(false);
  expect(() => foreground()).not.toThrow();
});
it("preserves a different owner when retrying an interrupted cold purge", async () => {
  state.stores.set(
    "bgo.cache-control.v1",
    new Map([
      ["owner", "bgo.cache.owner-b"],
      ["purge", "bgo.cache.owner-a"],
    ]),
  );
  state.keys.set("bgo.cache.owner-a", "orphaned-key");
  state.keys.set("bgo.cache.owner-b", "existing-key-b");
  const storage = await openMobileQueryStorage(b, current);
  expect(storage).toBeDefined();
  expect(state.keys.has("bgo.cache.owner-a")).toBe(false);
  expect(state.keys.get("bgo.cache.owner-b")).toBe("existing-key-b");
});
it("leaves a tombstone and revoked lease when clearing a live instance fails", async () => {
  const old = await openMobileQueryStorage(a, current);
  const native = vi.mocked(createMMKV).mock.results.at(-1)!.value;
  vi.mocked(native.clearAll).mockImplementationOnce(() => {
    throw new Error("clear failed");
  });
  await expect(purgeMobileQueryStorage()).rejects.toThrow("clear failed");
  expect(old!.getString("queries")).toBeUndefined();
  expect(state.stores.get("bgo.cache-control.v1")!.get("purge")).toBe("bgo.cache.owner-a");
  expect(await openMobileQueryStorage(b, current)).toBeDefined();
  expect(state.keys.has("bgo.cache.owner-a")).toBe(false);
  expect(() => foreground()).not.toThrow();
});
it("retries failed live reencryption without deleting a native instance", async () => {
  await openMobileQueryStorage(a, current);
  const native = vi.mocked(createMMKV).mock.results.at(-1)!.value;
  await purgeMobileQueryStorage();
  vi.mocked(native.encrypt).mockImplementationOnce(() => {
    throw new Error("encrypt failed");
  });
  await expect(openMobileQueryStorage(a, current)).rejects.toThrow("encrypt failed");
  expect(state.stores.get("bgo.cache-control.v1")!.get("purge")).toBe("bgo.cache.owner-a");
  expect(state.stores.get("bgo.cache-control.v1")!.get("owner")).toBeUndefined();
  expect(await openMobileQueryStorage(a, current)).toBeDefined();
  expect(state.native.get("bgo.cache.owner-a")!.key).toBe(state.keys.get("bgo.cache.owner-a"));
  expect(() => foreground()).not.toThrow();
});
it("retries partially written keys and constructor failures before restoring another owner", async () => {
  vi.mocked(setItemAsync).mockImplementationOnce(async (id, key) => {
    state.keys.set(id, key);
    throw new Error("key write failed");
  });
  await expect(openMobileQueryStorage(a, current)).rejects.toThrow("key write failed");
  expect(state.stores.get("bgo.cache-control.v1")!.get("purge")).toBe("bgo.cache.owner-a");
  vi.mocked(createMMKV).mockImplementationOnce(() => {
    throw new Error("native create failed");
  });
  await expect(openMobileQueryStorage(a, current)).rejects.toThrow("native create failed");
  expect(state.stores.get("bgo.cache-control.v1")!.get("owner")).toBeUndefined();
  expect(await openMobileQueryStorage(b, current)).toBeDefined();
  expect(state.keys.has("bgo.cache.owner-a")).toBe(false);
});
it.each(["read", "write"] as const)(
  "cancels in-flight key %s before logout completes",
  async (stage) => {
    let finish!: () => void;
    if (stage === "read")
      vi.mocked(getItemAsync).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(null);
          }),
      );
    else
      vi.mocked(setItemAsync).mockImplementationOnce(
        (id, key) =>
          new Promise((resolve) => {
            finish = () => {
              state.keys.set(id, key);
              resolve();
            };
          }),
      );
    const opening = openMobileQueryStorage(a, current);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const logout = purgeMobileQueryStorage();
    finish();
    expect(await opening).toBeUndefined();
    await logout;
    expect(state.keys.has("bgo.cache.owner-a")).toBe(false);
    expect(state.stores.get("bgo.cache-control.v1")!.has("purge")).toBe(false);
    expect(await openMobileQueryStorage(b, current)).toBeDefined();
    expect(() => foreground()).not.toThrow();
  },
);
it("blocks a caller revoked during its key read without activating the owner", async () => {
  let live = true;
  vi.mocked(getItemAsync).mockImplementationOnce(async () => {
    live = false;
    return null;
  });
  expect(await openMobileQueryStorage(a, () => live)).toBeUndefined();
  expect(state.stores.get("bgo.cache-control.v1")!.get("owner")).toBeUndefined();
});
it("preserves the tombstone if the caller is revoked inside native creation", async () => {
  let live = true;
  await purgeMobileQueryStorage(); // Create control storage before intercepting the owned instance.
  const factory = vi.mocked(createMMKV).getMockImplementation()!;
  vi.mocked(createMMKV).mockImplementationOnce((config) => {
    const storage = factory(config);
    live = false;
    return storage;
  });
  expect(await openMobileQueryStorage(a, () => live)).toBeUndefined();
  expect(state.stores.get("bgo.cache-control.v1")!.get("purge")).toBe("bgo.cache.owner-a");
  expect(await openMobileQueryStorage(b, current)).toBeDefined();
  expect(() => foreground()).not.toThrow();
});
