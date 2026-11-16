import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createMMKV, deleteMMKV, type MMKV } from "react-native-mmkv";
import type { CacheOwner, CacheStorage } from "./queryPersistence";

let control: MMKV | undefined;
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
const instances = new Map<string, MMKV>();
const metadata = () => (control ??= createMMKV({ id: "bgo.cache-control.v1" }));
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.catch(() => undefined);
  return result;
}
function clearStorage(id: string) {
  const storage = instances.get(id);
  // MMKV 4.3.2 keeps native AppState listeners: deleting a live instance leaves dangling pointers.
  if (storage) storage.clearAll();
  else deleteMMKV(id);
}
async function purge(id: string) {
  metadata().set("purge", id); // Survives a process death during asynchronous key deletion.
  clearStorage(id);
  await SecureStore.deleteItemAsync(id);
  if (metadata().getString("owner") === id) metadata().remove("owner");
  metadata().remove("purge");
}

export function purgeMobileQueryStorage() {
  ++generation; // Revoke leases and pending opens before queued/native or SecureStore work.
  const id = metadata().getString("purge") ?? metadata().getString("owner");
  if (id) metadata().set("purge", id);
  return serial(async () => {
    if (id) await purge(id);
  });
}

export function openMobileQueryStorage(owner: CacheOwner, isCurrent: () => boolean) {
  const ticket = ++generation;
  const active = () => ticket === generation && isCurrent();
  return serial(async (): Promise<CacheStorage | undefined> => {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      JSON.stringify([owner.apiUrl, owner.userId]),
    );
    if (!active()) return undefined;
    const pending = metadata().getString("purge");
    if (pending) await purge(pending);
    const id = `bgo.cache.${digest}`;
    const previous = metadata().getString("owner");
    if (previous && previous !== id) await purge(previous);
    if (!active()) return undefined;
    metadata().set("purge", id); // Failed/revoked opening must never restore a partially rekeyed cache.
    let key = await SecureStore.getItemAsync(id);
    if (!active()) return undefined;
    if (!key) {
      clearStorage(id); // A backup without its SecureStore key must never be read.
      const bytes = await Crypto.getRandomBytesAsync(32);
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      // MMKV AES-256 requires 32 ASCII bytes; these contain 192 bits of native CSPRNG entropy.
      key = Array.from(bytes, (byte) => alphabet[byte & 63]).join("");
      if (!active()) return undefined;
      await SecureStore.setItemAsync(id, key, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    if (!active()) return undefined;
    let storage = instances.get(id);
    if (storage) storage.encrypt(key, "AES-256");
    else {
      storage = createMMKV({
        id,
        encryptionKey: key,
        encryptionType: "AES-256",
        recoveryStrategy: "discard-on-error",
      });
      instances.set(id, storage);
    }
    if (!active()) return undefined;
    metadata().set("owner", id);
    metadata().remove("purge");
    return {
      getString: (key) => (active() ? storage.getString(key) : undefined),
      set: (key, value) => {
        if (active()) storage.set(key, value);
      },
      remove: (key) => (active() ? storage.remove(key) : false),
    };
  });
}
