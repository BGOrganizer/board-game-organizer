import type { NextConfig } from "next";

const ciDatabase = process.env.BGO_CI_DB_NAME;
if (ciDatabase) {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    !/^bgo_ci_[1-9][0-9]*_[1-9][0-9]*$/.test(ciDatabase)
  ) {
    throw new Error("CI database overrides require an isolated Preview database");
  }
  const baseDatabase = process.env.MONGODB_DB_NAME;
  const webhookDatabase = process.env.CLERK_WEBHOOK_DB_NAME;
  if (
    !baseDatabase ||
    baseDatabase === "[SENSITIVE]" ||
    baseDatabase.startsWith("bgo_ci_") ||
    webhookDatabase !== baseDatabase
  ) {
    throw new Error("Preview CLERK_WEBHOOK_DB_NAME must match the non-CI MONGODB_DB_NAME");
  }
  process.env.MONGODB_DB_NAME = ciDatabase;
  delete process.env.BGO_CI_DB_NAME;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.8.187:4000"], // Sostituisci con il tuo IP
};

export default nextConfig;
