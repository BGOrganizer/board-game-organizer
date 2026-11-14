import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createMMKV, deleteMMKV, type MMKV } from "react-native-mmkv";
import type { CacheOwner } from "./queryPersistence";

let control: MMKV | undefined;
let queue: Promise<unknown> = Promise.resolve();
const metadata = () => (control ??= createMMKV({ id: "bgo.cache-control.v1" }));
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.catch(() => undefined);
  return result;
}
async function purge(id: string) {
  metadata().set("purge", id); // Survives a process death during asynchronous key deletion.
  deleteMMKV(id);
  await SecureStore.deleteItemAsync(id);
  if (metadata().getString("owner") === id) metadata().remove("owner");
  metadata().remove("purge");
}

export function purgeMobileQueryStorage() {
  const id = metadata().getString("purge") ?? metadata().getString("owner");
  if (id) metadata().set("purge", id);
  return serial(async () => {
    if (id) await purge(id);
  });
}

export function openMobileQueryStorage(owner: CacheOwner, isCurrent: () => boolean) {
  return serial(async () => {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      JSON.stringify([owner.apiUrl, owner.userId]),
    );
    if (!isCurrent()) return undefined;
    const pending = metadata().getString("purge");
    if (pending) await purge(pending);
    const id = `bgo.cache.${digest}`;
    const previous = metadata().getString("owner");
    if (previous && previous !== id) await purge(previous);
    if (!isCurrent()) return undefined;
    let key = await SecureStore.getItemAsync(id);
    if (!isCurrent()) return undefined;
    if (!key) {
      deleteMMKV(id); // A restored backup without its SecureStore key must never be read.
      const bytes = await Crypto.getRandomBytesAsync(32);
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      // MMKV AES-256 requires 32 ASCII bytes; these contain 192 bits of native CSPRNG entropy.
      key = Array.from(bytes, (byte) => alphabet[byte & 63]).join("");
      if (!isCurrent()) return undefined;
      await SecureStore.setItemAsync(id, key, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    if (!isCurrent()) return undefined;
    metadata().set("owner", id);
    return createMMKV({
      id,
      encryptionKey: key,
      encryptionType: "AES-256",
      recoveryStrategy: "discard-on-error",
    });
  });
}
