import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

if (process.env.VERCEL === "1" || process.env.BGO_NETLIFY_STAGE) {
  const mapKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY?.trim();
  if (!mapKey || mapKey === "[SENSITIVE]") {
    throw new Error(
      "Set NEXT_PUBLIC_MAPTILER_API_KEY in Infisical before the web deployment build",
    );
  }
  const clerk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!clerk?.startsWith("pk_test_") && !clerk?.startsWith("pk_live_")) {
    throw new Error(
      "Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in Infisical before the web deployment build",
    );
  }
}

const nextConfig: NextConfig = {
  env: {
    ...(process.env.BGO_NETLIFY_STAGE && { NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS: "" }),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT:
      process.env.VERCEL_ENV === "production" || process.env.BGO_NETLIFY_STAGE === "production"
        ? "production"
        : "development",
    NEXT_PUBLIC_BUILD_SHA:
      process.env.NEXT_PUBLIC_BUILD_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GITHUB_SHA ??
      "",
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
  release: { create: false, finalize: false },
});
