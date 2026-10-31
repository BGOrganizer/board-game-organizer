import { createHash } from "node:crypto";

// Only the digest leaves this process; never emit private input values.
const names = [
  "MOBILE_BUILD_PROFILE",
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_MAPTILER_API_KEY",
  "EXPO_PUBLIC_SENTRY_DSN",
  "EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS",
  "GOOGLE_SERVICES_JSON_CONTENT",
];
export function mobileBuildInputs(env) {
  return createHash("sha256")
    .update(JSON.stringify(names.map((name) => [name, env[name] ?? ""])))
    .digest("hex");
}

if (process.argv[1]?.endsWith("mobile-build-inputs.mjs")) {
  console.log(mobileBuildInputs(process.env));
}
