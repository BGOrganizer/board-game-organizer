import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../../../.well-known/assetlinks.json/route";

afterEach(() => vi.unstubAllEnvs());
it.each([
  [
    "production",
    "com.bgo.boardgameorganizer",
    "B4:BD:6C:50:D4:77:69:CA:49:9B:86:91:A8:E7:3D:01:01:4C:26:E2:51:2E:A8:72:B4:D7:D3:6E:51:20:8E:24",
  ],
  [
    "preview",
    "com.bgo.boardgameorganizer.dev",
    "58:64:42:79:4B:70:47:BC:BE:E8:0C:DD:A1:B3:5C:5C:B2:E4:30:66:2E:AA:76:D3:31:A7:9A:DB:6F:50:1D:BA",
  ],
])("publishes only the matching %s public APK identity", async (env, pkg, cert) => {
  vi.stubEnv("VERCEL_ENV", env);
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("application/json");
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  expect(await response.json()).toEqual([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: [cert] },
    },
  ]);
});
