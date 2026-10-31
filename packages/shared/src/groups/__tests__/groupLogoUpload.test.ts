import { GROUP_LOGO_MAX_BYTES } from "@board-game-organizer/schemas";
import { afterEach, expect, it, vi } from "vitest";
import { uploadGroupLogo } from "../groupLogoUpload";

afterEach(() => vi.unstubAllGlobals());
it("uploads through group assets with fresh credentials on every step, never legacy organization paths", async () => {
  const options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: vi
      .fn()
      .mockResolvedValueOnce("start")
      .mockResolvedValueOnce("chunk")
      .mockResolvedValueOnce("complete"),
  };
  const fetch = vi.fn(
    async (url: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify(
          url.endsWith("/complete")
            ? { id: "asset", preview: "data:image/webp;base64,test" }
            : { id: "asset" },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  expect(await uploadGroupLogo(options, btoa("real bytes"), "image/png")).toEqual({
    id: "asset",
    preview: "data:image/webp;base64,test",
  });
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    "/api/group-assets",
    "/api/group-assets/asset",
    "/api/group-assets/asset/complete",
  ]);
  expect(
    fetch.mock.calls.map(
      ([, init]) => (init?.headers as Record<string, string> | undefined)?.Authorization,
    ),
  ).toEqual(["Bearer start", "Bearer chunk", "Bearer complete"]);
});
it("rejects oversize data before decoding or making a request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    uploadGroupLogo(
      { apiUrl: "https://api.test", userId: "owner", getToken: vi.fn() },
      "A".repeat(Math.ceil(GROUP_LOGO_MAX_BYTES / 3) * 4 + 1),
      "image/png",
    ),
  ).rejects.toThrow("Invalid group logo");
  expect(fetch).not.toHaveBeenCalled();
});
