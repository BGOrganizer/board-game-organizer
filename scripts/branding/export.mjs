import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
// Reuse API's declared image dependency and Uniwind's own color parser.
const apiRequire = createRequire(join(root, "apps/api/package.json"));
const mobileRequire = createRequire(join(root, "apps/mobile/package.json"));
const sharp = apiRequire("sharp");
const { formatHex, parse } = createRequire(mobileRequire.resolve("uniwind"))("culori");
const css = await readFile(
  join(dirname(mobileRequire.resolve("heroui-native/styles")), "variables.css"),
  "utf8",
);
function token(theme, name) {
  const block = css.split(`@variant ${theme} {`)[1]?.split("@variant ")[0];
  const value = block?.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];
  const color = value && formatHex(parse(value));
  assert(color, `Missing installed HeroUI ${theme}/${name} token`);
  return color;
}
const nativeColors = {
  lightBackground: token("light", "background"),
  darkBackground: token("dark", "background"),
  notificationTint: token("light", "accent"),
};
const source = (name) => join(root, "docs/assets", name);
const mascot = source("bgo-mascot-organizer.png");
// Crop the approved pixels without asking an image model to redraw the character.
const favicon = await sharp(mascot)
  .extract({ left: 390, top: 140, width: 550, height: 550 })
  .png()
  .toBuffer();
const mask = await sharp(mascot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const white = Buffer.alloc(mask.info.width * mask.info.height * 4, 255);
for (let pixel = 0; pixel < mask.data.length; pixel += 4)
  white[pixel + 3] = mask.data[pixel + 3] >= 128 ? 255 : 0;
// Preserve the approved eye glints and smile as cutouts from their original pixels.
// Bounds belong to this particular master, just like the favicon crop above.
for (const [left, top, width, height] of [
  [540, 390, 100, 100],
  [735, 350, 100, 100],
  [630, 410, 120, 120],
]) {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      const pixel = (y * mask.info.width + x) * 4;
      // Indigo ink and the pink mouth have less blue than the purple body.
      if (mask.data[pixel + 2] < 165) white[pixel + 3] = 0;
    }
  }
}
const monochrome = await sharp(white, {
  raw: { width: mask.info.width, height: mask.info.height, channels: 4 },
})
  .png()
  .toBuffer();

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
async function fit(input, size, contentSize = size) {
  const image = await sharp(input)
    .trim({ background: transparent, threshold: 16 })
    .resize(contentSize, contentSize, { fit: "inside" })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: transparent } })
    .composite([{ input: image, gravity: "centre" }])
    .png()
    .toBuffer();
}
async function fitMask(size, contentSize) {
  const { data, info } = await sharp(await fit(monochrome, size, contentSize))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Resampling can round RGB edge values; Android requires white RGB with alpha only.
  for (let pixel = 0; pixel < data.length; pixel += 4) {
    data[pixel] = 255;
    data[pixel + 1] = 255;
    data[pixel + 2] = 255;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}
const icon = await sharp(await fit(mascot, 1024, 880))
  .flatten({ background: nativeColors.lightBackground })
  .png()
  .toBuffer();
const outputs = new Map([
  [
    "apps/mobile/assets/splash-android.png",
    await sharp({ create: { width: 1, height: 1, channels: 4, background: transparent } })
      .png()
      .toBuffer(),
  ],
  ["apps/mobile/assets/icon.png", icon],
  ["apps/mobile/assets/splash.png", await sharp(mascot).resize(1024, 1024).png().toBuffer()],
  ["apps/mobile/assets/adaptive-icon-foreground.png", await fit(mascot, 1024, 544)],
  ["apps/mobile/assets/adaptive-icon-monochrome.png", await fitMask(1024, 544)],
  [
    "apps/mobile/assets/adaptive-icon-background.png",
    await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: nativeColors.lightBackground },
    })
      .png()
      .toBuffer(),
  ],
  ["apps/mobile/assets/notification-icon.png", await fitMask(96, 80)],
  [
    "apps/web/public/branding/notification-icon.png",
    await sharp(icon).resize(192).png().toBuffer(),
  ],
  ["apps/web/public/branding/notification-badge.png", await fitMask(96, 80)],
  ["apps/web/src/app/icon.png", await fit(favicon, 32, 30)],
  ["apps/web/src/app/apple-icon.png", await sharp(icon).resize(180).png().toBuffer()],
]);

// PNG-backed ICO entries let browsers select a native-size frame without resampling.
const sizes = [16, 32, 48, 64];
const frames = await Promise.all(sizes.map((size) => fit(favicon, size, size - 2)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frames[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frames[index].length;
}
outputs.set("apps/web/src/app/favicon.ico", Buffer.concat([header, ...frames]));
outputs.set(
  "apps/mobile/assets/branding.json",
  Buffer.from(
    `${JSON.stringify({ herouiVersion: mobileRequire("heroui-native/package.json").version, nativeColors }, null, 2)}\n`,
  ),
);
// Check exported pixels, not just metadata: masks must remain usable after resampling.
for (const file of [
  "apps/mobile/assets/adaptive-icon-foreground.png",
  "apps/mobile/assets/adaptive-icon-monochrome.png",
  "apps/mobile/assets/notification-icon.png",
  "apps/web/public/branding/notification-badge.png",
]) {
  const { data, info } = await sharp(outputs.get(file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const adaptive = file.includes("adaptive");
  const isMask = !file.includes("foreground");
  let visible = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const pixel = (y * info.width + x) * 4;
      if (isMask && data[pixel + 3] > 0)
        assert(
          data.subarray(pixel, pixel + 3).every((value) => value === 255),
          `${file}: RGB`,
        );
      if (data[pixel + 3] <= 16) continue;
      visible++;
      assert(x > 0 && y > 0 && x < info.width - 1 && y < info.height - 1, `${file}: crop`);
      if (adaptive)
        assert(
          Math.hypot(x - (info.width - 1) / 2, y - (info.height - 1) / 2) <=
            (info.width * 33) / 108,
          `${file}: Android safe circle`,
        );
    }
  }
  assert(visible > 0, `${file}: empty mask`);
}
const check = process.argv.includes("--check");
for (const [file, bytes] of outputs) {
  const path = join(root, file);
  if (check) assert.deepEqual(await readFile(path), bytes, `Regenerate ${file}`);
  else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
}
console.log(
  `${check ? "Verified" : "Exported"} ${outputs.size} mascot assets with stock HeroUI colors.`,
);
