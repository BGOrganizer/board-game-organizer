export const repository = "https://github.com/BGOrganizer/board-game-organizer";
export const latestRelease = `${repository}/releases/latest`;
export const license = `${repository}/blob/main/LICENSE`;

const currentWebOrigin = "https://board-game-organizer.com";

export function webSignInUrl(
  configuredOrigin = process.env.NEXT_PUBLIC_BGO_WEB_ORIGIN,
  vercel = process.env.VERCEL === "1",
): string {
  const target = process.env.BGO_SITE_VERCEL_TARGET;
  if (target && process.env.VERCEL_ENV !== target) {
    throw new Error(
      `Site expected a Vercel ${target} build. Check the deployment environment and initialize the Vercel project before previewing.`,
    );
  }
  const origin = configuredOrigin?.trim();
  if (!origin) {
    if (vercel) throw new Error("Set NEXT_PUBLIC_BGO_WEB_ORIGIN for the Site deployment");
    return `${currentWebOrigin}/sign-in`;
  }

  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin.replace(/\/$/, "")) {
    throw new Error("NEXT_PUBLIC_BGO_WEB_ORIGIN must be an HTTPS origin with no path");
  }
  return `${url.origin}/sign-in`;
}
