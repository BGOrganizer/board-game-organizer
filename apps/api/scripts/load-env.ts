import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";

/** Load Next.js environment files before CLI scripts access MongoDB or Clerk. */
export function loadApiEnv(directory = fileURLToPath(new URL("../", import.meta.url))) {
  loadEnvConfig(directory, process.env.NODE_ENV !== "production");
}
