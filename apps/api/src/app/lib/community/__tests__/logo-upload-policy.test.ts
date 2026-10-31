import { afterEach, expect, it, vi } from "vitest";
import { GroupAssetsService } from "../../groups/group-assets.service";
import { OrganizationAssetsService } from "../../organizations/organization-assets.service";
import { logoUploadQuotaEnabled } from "../logo-upload-policy";

afterEach(() => vi.unstubAllEnvs());
it.each(["production", "development", "unknown", undefined, "preview"])(
  "only Vercel Preview skips the logo quota: %s",
  async (environment) => {
    vi.stubEnv("VERCEL_ENV", environment);
    expect(logoUploadQuotaEnabled()).toBe(environment !== "preview");
    for (const Service of [GroupAssetsService, OrganizationAssetsService]) {
      const assets = {
        countUnclaimed: vi.fn(async () => 5),
        create: vi.fn(async (value) => value),
      };
      const users = { lock: vi.fn(async () => {}) };
      const service = new Service(assets as never, {} as never, users as never);
      const call = service.start("owner", { mimeType: "image/png", byteLength: 3 });
      if (environment === "preview") {
        expect(await call).toMatchObject({ id: expect.any(String), receivedBytes: 0 });
        expect(assets.countUnclaimed).not.toHaveBeenCalled();
        expect(assets.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: "UPLOADING",
            byteLength: 3,
            expiresAt: expect.any(Date),
          }),
        );
      } else {
        await expect(call).rejects.toMatchObject({ status: 429, message: "TOO_MANY_LOGO_UPLOADS" });
        expect(assets.create).not.toHaveBeenCalled();
        expect(users.lock.mock.invocationCallOrder[0]).toBeLessThan(
          assets.countUnclaimed.mock.invocationCallOrder[0],
        );
      }
      expect(users.lock).toHaveBeenCalledWith("owner");
    }
  },
);
it("preserves serialized normal uploads and never bypasses owner locking in Preview", async () => {
  for (const environment of ["production", "preview"]) {
    vi.stubEnv("VERCEL_ENV", environment);
    const assets = { countUnclaimed: vi.fn(async () => 4), create: vi.fn(async (value) => value) };
    const users = { lock: vi.fn(async () => {}) };
    const service = new GroupAssetsService(assets as never, {} as never, users as never);
    await service.start("owner", { mimeType: "image/jpeg", byteLength: 3 });
    expect(assets.create).toHaveBeenCalledTimes(1);
    users.lock.mockRejectedValueOnce(new Error("owner unavailable"));
    await expect(service.start("owner", { mimeType: "image/jpeg", byteLength: 3 })).rejects.toThrow(
      "owner unavailable",
    );
    expect(assets.create).toHaveBeenCalledTimes(1);
  }
});
