/** Stable public link routing never changes the API/session used by the installed app. */
export const inviteAppOrigin = "https://api.board-game-organizer.com";
const tokenPattern = "[A-Za-z0-9_-]{22}";
const developmentOrigin =
  /^https:\/\/api-development-pr-[1-9][0-9]*-board-game-organizers-projects\.vercel\.app$/;
export function isDevelopmentInviteOrigin(origin: string) {
  return developmentOrigin.test(origin);
}

function developmentInvite(value: string) {
  try {
    const url = new URL(value);
    const match = new RegExp(`^/invite/(${tokenPattern})$`).exec(url.pathname);
    if (
      !match ||
      !isDevelopmentInviteOrigin(url.origin) ||
      value !== `${url.origin}${url.pathname}`
    )
      return null;
    return { token: match[1], web: value };
  } catch {
    return null;
  }
}

/** Only canonical owned, non-CI Development aliases may be web fallbacks. */
export function developmentInviteWebTarget(token: string, web: string | null): string | null {
  const target = web === null ? null : developmentInvite(web);
  return target?.token === token ? target.web : null;
}
export function developmentInviteAppLink(web: string): string | null {
  const target = developmentInvite(web);
  if (!target) return null;
  const url = new URL(`/development/invite/${target.token}`, inviteAppOrigin);
  url.searchParams.set("web", target.web);
  return url.href;
}

/** Incoming query parameters are discarded, including any attempted API override. */
export function developmentInviteNativePath(path: string): string | null {
  try {
    const url = new URL(path, inviteAppOrigin);
    const match = new RegExp(`^/development/invite/(${tokenPattern})$`).exec(url.pathname);
    const canonical = path.split(/[?#]/, 1)[0];
    if (
      !match ||
      url.origin !== inviteAppOrigin ||
      (canonical !== url.pathname && canonical !== `${inviteAppOrigin}${url.pathname}`)
    )
      return null;
    return `/invite/${match[1]}`;
  } catch {
    return null;
  }
}
