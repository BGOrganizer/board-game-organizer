import { developmentInviteAppLink, inviteAppOrigin } from "@board-game-organizer/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { appLinkAssociation } from "../app-link-association";
import { developmentInvitePublication } from "../development-invite-publication";
import { inviteAppLinkReady, inviteLinkFields } from "../invite-app-link";

vi.mock("../development-invite-publication", () => ({
  developmentInvitePublication: vi.fn().mockResolvedValue("eligible"),
}));
const origin = "https://api-development-pr-25-board-game-organizers-projects.vercel.app";
const token = "abcdefghijklmnopqrstuv";
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.mocked(developmentInvitePublication).mockResolvedValue("eligible");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("does not probe Production for local, CI, immutable or Production API origins", async () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  for (const url of [
    "http://localhost:4000",
    inviteAppOrigin,
    "https://api-abcdefghi-board-game-organizers-projects.vercel.app",
    "https://api-ci-pr-25-board-game-organizers-projects.vercel.app",
  ])
    expect(await inviteAppLinkReady(url)).toBe(false);
  expect(request).not.toHaveBeenCalled();
});
it("probes only public association readiness without credentials, redirects or private parameters", async () => {
  const request = vi.fn().mockResolvedValue(Response.json(appLinkAssociation(true)));
  vi.stubGlobal("fetch", request);
  expect(await inviteAppLinkReady(origin)).toBe(true);
  expect(developmentInvitePublication).toHaveBeenCalledWith(origin, true);
  expect(request).toHaveBeenCalledWith(`${inviteAppOrigin}/.well-known/assetlinks.json`, {
    credentials: "omit",
    redirect: "error",
    signal: expect.any(AbortSignal),
    next: { revalidate: 60 },
    headers: { Accept: "application/json" },
  });
});
it.each(["ineligible", "unavailable"] as const)(
  "keeps the canonical link for a %s public release",
  async (status) => {
    vi.mocked(developmentInvitePublication).mockResolvedValue(status);
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await inviteAppLinkReady(origin)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  },
);
it.each([
  new Response("not deployed", { status: 404 }),
  Response.json(null),
  Response.json({}),
  Response.json([]),
  Response.json([
    null,
    {},
    { relation: "delegate_permission/common.handle_all_urls" },
    { relation: [] },
  ]),
  Response.json([{ relation: ["other"], target: appLinkAssociation(false)[0].target }]),
  Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { ...appLinkAssociation(false)[0].target, namespace: "other" },
    },
  ]),
  Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { ...appLinkAssociation(false)[0].target, package_name: "other" },
    },
  ]),
  Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { ...appLinkAssociation(false)[0].target, sha256_cert_fingerprints: "invalid" },
    },
  ]),
  Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        ...appLinkAssociation(false)[0].target,
        sha256_cert_fingerprints: ["unrecognized"],
      },
    },
  ]),
])("keeps the canonical link until association readiness is verified (%#)", async (response) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  expect(await inviteAppLinkReady(origin)).toBe(false);
});
it("retains the canonical link after network, timeout or malformed JSON failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  expect(await inviteAppLinkReady(origin)).toBe(false);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));
  expect(await inviteAppLinkReady(origin)).toBe(false);
});
it("adds only an exact optional stable app URL while retaining the API-hosted claim URL", () => {
  const link = `${origin}/invite/${token}`;
  expect(inviteLinkFields(origin, token, false)).toEqual({ link });
  expect(inviteLinkFields(origin, token, true)).toEqual({
    link,
    appLink: developmentInviteAppLink(link),
  });
  expect(inviteLinkFields(inviteAppOrigin, token, true)).toEqual({
    link: `${inviteAppOrigin}/invite/${token}`,
  });
});

it.each(["production", "development", "", undefined])(
  "never probes the public domain from a non-Preview server (%s)",
  async (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await inviteAppLinkReady(origin)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  },
);
