import { renderHook } from "@testing-library/react-native";
import { expect, it, vi } from "vitest";
import { useMobileCache } from "../cache/mobileCacheContext";

it("delegates logout to the supplied operation when storage is unavailable", async () => {
  const { result } = await renderHook(useMobileCache);
  const error = new Error("Session service unavailable");
  const work = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce(undefined);

  expect(result.current.restoring).toBe(false);
  await expect(result.current.signOut(work)).rejects.toBe(error);
  await expect(result.current.signOut(work)).resolves.toBeUndefined();
  expect(work).toHaveBeenCalledTimes(2);
});
