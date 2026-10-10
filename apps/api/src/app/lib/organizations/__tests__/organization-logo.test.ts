import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareOrganizationLogo } from "../organization-logo";

afterEach(() => vi.restoreAllMocks());
const image = () => sharp({ create: { width: 300, height: 150, channels: 4, background: "red" } });

describe("server-verified logo previews", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "accepts real %s data and strips metadata",
    async (format) => {
      const bytes = await image().toFormat(format).toBuffer();
      const result = await prepareOrganizationLogo(bytes, `image/${format}`);
      const original = await sharp(Buffer.from(result.base64, "base64")).metadata();
      expect(original.format).toBe("webp");
      expect(original.width).toBe(300);
      expect(original.height).toBe(150);
      expect(original.exif).toBeUndefined();
      for (const [data, size] of [
        [result.previewBase64, 512],
        [result.thumbnailBase64, 128],
      ] as const) {
        const metadata = await sharp(Buffer.from(data, "base64")).metadata();
        expect(metadata.width).toBe(size);
        expect(metadata.height).toBe(size);
      }
      const { data, info } = await sharp(Buffer.from(result.previewBase64, "base64"))
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.channels).toBe(4);
      expect(data[3]).toBe(0); // Transparent margins, not a stretched/cropped rectangle.
      expect(data[(256 * info.width + 256) * info.channels]).toBeGreaterThan(200);
      expect(data[(256 * info.width + 256) * info.channels + 3]).toBe(255);
    },
  );
  it("rejects spoofed MIME, SVG and undecodable data", async () => {
    const png = await image().png().toBuffer();
    for (const bytes of [
      png,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'),
      Buffer.from("not an image"),
    ]) {
      await expect(prepareOrganizationLogo(bytes, "image/jpeg")).rejects.toMatchObject({
        status: 400,
        code: "INVALID_LOGO_IMAGE",
      });
    }
  });
  it("fails closed for missing dimensions, animations or decoder failures", async () => {
    const bytes = await image().png().toBuffer();
    const prototype = Object.getPrototypeOf(sharp(bytes));
    const metadata = await sharp(bytes).metadata();
    const spy = vi.spyOn(prototype, "metadata");
    for (const value of [
      { ...metadata, width: 0 },
      { ...metadata, height: 0 },
      { ...metadata, pages: 2 },
    ]) {
      spy.mockResolvedValueOnce(value);
      await expect(prepareOrganizationLogo(bytes, "image/png")).rejects.toMatchObject({
        status: 400,
      });
    }
    spy.mockResolvedValueOnce({ ...metadata, pages: 1 });
    vi.spyOn(prototype, "toBuffer").mockRejectedValueOnce(new Error("Decoder failed"));
    await expect(prepareOrganizationLogo(bytes, "image/png")).rejects.toMatchObject({
      status: 400,
    });
  });
});
