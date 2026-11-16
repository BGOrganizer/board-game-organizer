import {
  developmentInviteAppLink,
  inviteAppOrigin,
  isDevelopmentInviteOrigin,
} from "@board-game-organizer/shared";
import { appLinkAssociation } from "./app-link-association";
import { developmentInvitePublication } from "./development-invite-publication";

/** Public readiness only: no authentication, database/user data or Preview bypass is forwarded. */
export async function inviteAppLinkReady(origin: string): Promise<boolean> {
  if (process.env.VERCEL_ENV !== "preview" || !isDevelopmentInviteOrigin(origin)) return false;
  if ((await developmentInvitePublication(origin, true)) !== "eligible") return false;
  try {
    const response = await fetch(`${inviteAppOrigin}/.well-known/assetlinks.json`, {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(1500),
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const records: unknown = await response.json();
    const expected = appLinkAssociation(false)[0];
    return (
      Array.isArray(records) &&
      records.some((record) => {
        const target = record?.target;
        return (
          Array.isArray(record?.relation) &&
          record.relation.includes(expected.relation[0]) &&
          target?.namespace === expected.target.namespace &&
          target.package_name === expected.target.package_name &&
          Array.isArray(target.sha256_cert_fingerprints) &&
          target.sha256_cert_fingerprints.includes(expected.target.sha256_cert_fingerprints[0])
        );
      })
    );
  } catch {
    // Before the public deployment is ready, the original API-hosted invitation remains usable.
    return false;
  }
}
export function inviteLinkFields(origin: string, token: string, ready: boolean) {
  const link = `${origin}/invite/${token}`;
  const appLink = ready ? developmentInviteAppLink(link) : null;
  return { link, ...(appLink ? { appLink } : {}) };
}
