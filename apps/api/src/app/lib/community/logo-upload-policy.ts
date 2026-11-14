/** Only the platform's Preview environment opts out; missing/unknown values fail closed. */
export function logoUploadQuotaEnabled() {
  return process.env.VERCEL_ENV !== "preview";
}
