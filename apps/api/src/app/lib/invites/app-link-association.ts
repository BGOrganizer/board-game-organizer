export function isProductionInviteDeployment() {
  return process.env.VERCEL_ENV === "production" || process.env.BGO_NETLIFY_STAGE === "production";
}

/** Public fingerprints from verified EAS APKs; update on signing-key changes. */
export function appLinkAssociation(production: boolean) {
  const development = {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.bgo.boardgameorganizer.dev",
      sha256_cert_fingerprints: [
        "58:64:42:79:4B:70:47:BC:BE:E8:0C:DD:A1:B3:5C:5C:B2:E4:30:66:2E:AA:76:D3:31:A7:9A:DB:6F:50:1D:BA",
      ],
    },
  };
  return production
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "com.bgo.boardgameorganizer",
            sha256_cert_fingerprints: [
              "B4:BD:6C:50:D4:77:69:CA:49:9B:86:91:A8:E7:3D:01:01:4C:26:E2:51:2E:A8:72:B4:D7:D3:6E:51:20:8E:24",
            ],
          },
        },
        development,
      ]
    : [development];
}
