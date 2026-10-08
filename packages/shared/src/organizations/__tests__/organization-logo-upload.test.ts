import { ORGANIZATION_LOGO_CHUNK_BYTES } from "@board-game-organizer/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64, uploadOrganizationLogo } from "../organizationLogoUpload";

const options = {
  apiUrl: "https://api.example.test",
  userId: "owner",
  getToken: vi.fn(async () => "fresh"),
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe("bounded organization logo upload", () => {
  it("round-trips all byte values across string conversion chunks", () => {
    const bytes = Uint8Array.from({ length: 65537 }, (_, index) => index % 256);
    const encoded = bytesToBase64(bytes);
    expect(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))).toEqual(bytes);
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });
  it("uploads sequential binary-sized chunks with fresh token and cancellation signal for each request", async () => {
    const data = Uint8Array.from({ length: ORGANIZATION_LOGO_CHUNK_BYTES + 3 }, (_, i) => i % 256);
    const calls: { url: string; init: RequestInit }[] = [];
    let active = 0;
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(active).toBe(0);
      active++;
      calls.push({ url, init });
      await Promise.resolve();
      active--;
      return new Response(
        JSON.stringify(
          url.endsWith("/complete")
            ? { id: "asset", preview: "data:image/webp;base64,preview" }
            : url.endsWith("/organization-assets")
              ? { id: "asset" }
              : { success: true },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    expect(
      await uploadOrganizationLogo(options, bytesToBase64(data), "image/jpeg", controller.signal),
    ).toEqual({ id: "asset", preview: "data:image/webp;base64,preview" });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(options.getToken).toHaveBeenCalledTimes(4);
    expect(calls.map((call) => call.init.method)).toEqual(["POST", "PATCH", "PATCH", "POST"]);
    expect(calls.every((call) => call.init.signal === controller.signal)).toBe(true);
    expect(
      calls.every((call) => new Headers(call.init.headers).get("Authorization") === "Bearer fresh"),
    ).toBe(true);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      mimeType: "image/jpeg",
      byteLength: data.length,
    });
    expect(JSON.parse(String(calls[1].init.body)).offset).toBe(0);
    expect(atob(JSON.parse(String(calls[1].init.body)).base64)).toHaveLength(
      ORGANIZATION_LOGO_CHUNK_BYTES,
    );
    expect(JSON.parse(String(calls[2].init.body)).offset).toBe(ORGANIZATION_LOGO_CHUNK_BYTES);
    expect(atob(JSON.parse(String(calls[2].init.body)).base64)).toHaveLength(3);
  });
  it.each([
    ["AA", "image/png"],
    ["!invalid!", "image/png"],
    ["", "image/png"],
    ["AA==", "image/svg+xml"],
  ])(
    "rejects noncanonical, invalid, empty or unsupported input before network calls",
    async (base64, mime) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await expect(uploadOrganizationLogo(options, base64, mime)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("rejects over-limit images before starting an upload", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      uploadOrganizationLogo(options, bytesToBase64(new Uint8Array(5_000_001)), "image/jpeg"),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects oversized base64 before decoding or issuing network requests", async () => {
    const decode = vi.spyOn(globalThis, "atob"),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      uploadOrganizationLogo(options, "A".repeat(Math.ceil(5_000_000 / 3) * 4 + 4), "image/png"),
    ).rejects.toThrow("Invalid organization logo");
    expect(decode).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("stops when a chunk fails; does not complete a partial upload", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "asset" })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "UPLOAD_CHANGED" }), { status: 409 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(uploadOrganizationLogo(options, "AA==", "image/png")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
