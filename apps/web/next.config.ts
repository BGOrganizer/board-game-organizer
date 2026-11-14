import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

if (process.env.VERCEL === "1") {
  const mapKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY?.trim();
  if (!mapKey || mapKey === "[SENSITIVE]") {
    throw new Error(
      "Set NEXT_PUBLIC_MAPTILER_API_KEY in Infisical/Vercel before the web deployment build",
    );
  }
  const clerk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!clerk?.startsWith("pk_test_") && !clerk?.startsWith("pk_live_")) {
    throw new Error(
      "Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in Infisical/Vercel before the web deployment build",
    );
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SENTRY_ENVIRONMENT:
      process.env.VERCEL_ENV === "production" ? "production" : "development",
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
  release: { create: false, finalize: false },
});
