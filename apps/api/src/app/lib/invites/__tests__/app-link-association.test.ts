import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../../../.well-known/assetlinks.json/route";
import { appLinkAssociation } from "../app-link-association";

afterEach(() => vi.unstubAllEnvs());
it.each([
  { name: "Vercel Production", vercel: "production", production: true },
  { name: "Vercel Preview", vercel: "preview", production: false },
  { name: "Netlify Production", netlify: "production", production: true },
  { name: "Netlify Development", netlify: "development", production: false },
])(
  "publishes the verified public APK identities for $name",
  async ({ vercel, netlify, production }) => {
    vi.stubEnv("VERCEL_ENV", vercel);
    vi.stubEnv("BGO_NETLIFY_STAGE", netlify);
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    const records = await response.json();
    expect(records).toEqual(appLinkAssociation(production));
    expect(
      records.map((row: { target: { package_name: string } }) => row.target.package_name),
    ).toEqual(
      production
        ? ["com.bgo.boardgameorganizer", "com.bgo.boardgameorganizer.dev"]
        : ["com.bgo.boardgameorganizer.dev"],
    );
    expect(records.at(-1).target.sha256_cert_fingerprints).toEqual([
      "58:64:42:79:4B:70:47:BC:BE:E8:0C:DD:A1:B3:5C:5C:B2:E4:30:66:2E:AA:76:D3:31:A7:9A:DB:6F:50:1D:BA",
    ]);
    if (production)
      expect(records[0].target.sha256_cert_fingerprints).toEqual([
        "B4:BD:6C:50:D4:77:69:CA:49:9B:86:91:A8:E7:3D:01:01:4C:26:E2:51:2E:A8:72:B4:D7:D3:6E:51:20:8E:24",
      ]);
  },
);
