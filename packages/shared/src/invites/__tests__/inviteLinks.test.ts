import { describe, expect, it } from "vitest";
import {
  developmentInviteAppLink,
  developmentInviteNativePath,
  developmentInviteWebTarget,
  inviteAppOrigin,
  isDevelopmentInviteOrigin,
} from "../inviteLinks";

const token = "abcdefghijklmnopqrstuv";
const origin = "https://api-development-pr-25-board-game-organizers-projects.vercel.app";
const web = `${origin}/invite/${token}`;
const path = `/development/invite/${token}`;
const app = `${inviteAppOrigin}${path}?web=${encodeURIComponent(web)}`;
describe("isolated Development invite links", () => {
  it("keeps the public stable route distinct from the exact configured Preview API", () => {
    expect(isDevelopmentInviteOrigin(origin)).toBe(true);
    expect(developmentInviteAppLink(web)).toBe(app);
    expect(developmentInviteWebTarget(token, web)).toBe(web);
    expect(developmentInviteWebTarget("different-token", web)).toBeNull();
    expect(developmentInviteWebTarget(token, null)).toBeNull();
  });
  it.each([
    "not a URL",
    "https://[",
    `${origin}/invite/short`,
    `${origin}/other/${token}`,
    `${origin}/invite/${token}/`,
    web + "?",
    web + "#",
    web + "?apiUrl=https://evil.test",
    web + "#fragment",
    web + "/../" + token,
    web.replace("https:", "http:"),
    web.replace("https://", "https://user:password@"),
    web.replace("https://", "https://:password@"),
    web.replace(".app/", ".app:443/"),
    web.replace(".app/", ".app:444/"),
    web.replace("pr-25", "pr-0"),
    web.replace("pr-25", "pr-025"),
    web.replace("api-development-pr-25", "api-abcdefghi"),
    web.replace("api-development-pr-25", "api-ci-pr-25"),
    web.replace("api-development-pr-25", "api-production"),
    web.replace(".app/", ".app.evil.test/"),
    web.replace("api-development-pr", "API-DEVELOPMENT-PR"),
    web.replace("/invite/a", "/invite/%61"),
    "https://api.board-game-organizer.com/invite/" + token,
  ])("rejects untrusted, noncanonical or cross-environment target %s", (input) => {
    expect(developmentInviteAppLink(input)).toBeNull();
    expect(developmentInviteWebTarget(token, input)).toBeNull();
  });
  it("normalizes only the verified stable native destination, ignoring all URL parameters", () => {
    for (const input of [
      path,
      `${inviteAppOrigin}${path}`,
      app,
      path + "?apiUrl=https://evil.test#fragment",
      `${inviteAppOrigin}${path}#ignored`,
    ])
      expect(developmentInviteNativePath(input)).toBe(`/invite/${token}`);
  });
  it.each([
    "https://[",
    "https://evil.test" + path,
    "http://api.board-game-organizer.com" + path,
    "https://user:password@api.board-game-organizer.com" + path,
    "https://:password@api.board-game-organizer.com" + path,
    "https://api.board-game-organizer.com:443" + path,
    "https://api.board-game-organizer.com:444" + path,
    "//api.board-game-organizer.com" + path,
    "bgo-dev://" + path,
    "/development/invite/short",
    `/invite/${token}`,
    path.replace("/invite/a", "/invite/%61"),
    path + "/",
    path.slice(1),
  ])("leaves other native destinations unchanged by returning null: %s", (input) =>
    expect(developmentInviteNativePath(input)).toBeNull(),
  );
});
