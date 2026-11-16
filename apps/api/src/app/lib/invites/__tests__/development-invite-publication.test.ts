import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { developmentInvitePublication } from "../development-invite-publication";

const origin = "https://api-development-pr-25-board-game-organizers-projects.vercel.app";
const sha = "a".repeat(40);
const repo = { full_name: "BGOrganizer/board-game-organizer" };
const pr = {
  number: 25,
  state: "open",
  merged: false,
  base: { ref: "main", repo },
  head: { sha, repo },
};
const release = {
  draft: false,
  prerelease: true,
  tag_name: "development-pr-25",
  target_commitish: sha,
  body: `<!-- bgo:development-pr=25 -->\n\n- **API:** [API endpoint](${origin}/)\n`,
};
const request = vi.fn();
beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (url: string) =>
    Response.json(url.includes("/pulls/") ? pr : release),
  );
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());

it.each([false, true])("verifies fixed public repository receipts (cached=%s)", async (cached) => {
  expect(await developmentInvitePublication(origin, cached)).toBe("eligible");
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    "https://api.github.com/repos/BGOrganizer/board-game-organizer/pulls/25",
    "https://api.github.com/repos/BGOrganizer/board-game-organizer/releases/tags/development-pr-25",
  ]);
  for (const [, options] of request.mock.calls)
    expect(options).toEqual({
      credentials: "omit",
      redirect: "error",
      signal: expect.any(AbortSignal),
      ...(cached ? { next: { revalidate: 300 } } : { cache: "no-store" }),
      headers: { Accept: "application/vnd.github+json" },
    });
});
it("defaults to a fresh gateway proof", async () => {
  expect(await developmentInvitePublication(origin)).toBe("eligible");
  expect(request.mock.calls[0][1]).toHaveProperty("cache", "no-store");
});
it("starts both bounded requests in parallel", async () => {
  const complete: Array<(response: Response) => void> = [];
  request.mockImplementation(() => new Promise<Response>((resolve) => complete.push(resolve)));
  const pending = developmentInvitePublication(origin);
  expect(request).toHaveBeenCalledTimes(2);
  complete[0](Response.json(pr));
  complete[1](Response.json(release));
  expect(await pending).toBe("eligible");
});
it.each([
  "https://api.board-game-organizer.com",
  "https://api-development-pr-0-board-game-organizers-projects.vercel.app",
  "https://api-development-pr-25-board-game-organizers-projects.vercel.app.evil.test",
  `${origin}/`,
])("rejects noncanonical origins without any external request (%s)", async (value) => {
  expect(await developmentInvitePublication(value)).toBe("ineligible");
  expect(request).not.toHaveBeenCalled();
});
it("accepts a merged PR after the public gateway is deployed", async () => {
  request.mockResolvedValueOnce(Response.json({ ...pr, state: "closed", merged: true }));
  expect(await developmentInvitePublication(origin)).toBe("eligible");
});
it.each([
  null,
  {},
  { ...pr, number: 26 },
  { ...pr, number: "25" },
  { ...pr, state: "closed" },
  { ...pr, merged: true },
  { ...pr, state: "unknown" },
  { ...pr, merged: "true" },
  { ...pr, base: { ...pr.base, ref: "other" } },
  { ...pr, base: { ...pr.base, repo: { full_name: "attacker/other" } } },
  { ...pr, head: { ...pr.head, repo: { full_name: "attacker/board-game-organizer" } } },
  { ...pr, head: { ...pr.head, repo: null } },
  { ...pr, head: { ...pr.head, sha: "main" } },
])("rejects untrusted or closed-unmerged PR metadata (%#)", async (body) => {
  request.mockResolvedValueOnce(Response.json(body));
  expect(await developmentInvitePublication(origin)).toBe("ineligible");
});
it.each([
  null,
  {},
  { ...release, draft: true },
  { ...release, prerelease: false },
  { ...release, tag_name: "development-pr-26" },
  { ...release, target_commitish: "b".repeat(40) },
  { ...release, body: `<!-- bgo:development-pr=26 -->\n- **API:** [API endpoint](${origin}/)` },
  { ...release, body: `${release.body}prefix`.replace("<!--", "prefix<!--") },
  { ...release, body: release.body.replace(origin, `${origin}.evil.test`) },
  { ...release, body: release.body.replace("API endpoint", "other") },
  { ...release, body: release.body.replace(`${origin}/`, origin) },
])("rejects unpublished, stale or mismatched release receipts (%#)", async (body) => {
  request.mockImplementation(async (url: string) =>
    Response.json(url.includes("/pulls/") ? pr : body),
  );
  expect(await developmentInvitePublication(origin)).toBe("ineligible");
});
it.each([0, 1])("rejects missing public receipts (%s)", async (missing) => {
  request.mockImplementation(async (url: string) =>
    (url.includes("/pulls/") ? 0 : 1) === missing
      ? new Response(null, { status: 404 })
      : Response.json(url.includes("/pulls/") ? pr : release),
  );
  expect(await developmentInvitePublication(origin)).toBe("ineligible");
});
it.each([201, 301, 401, 403, 429, 500])(
  "fails closed on an unexpected public provider status (%s)",
  async (status) => {
    request.mockResolvedValueOnce(new Response(null, { status }));
    expect(await developmentInvitePublication(origin)).toBe("unavailable");
  },
);
it("fails closed on network/timeout and JSON failures", async () => {
  request.mockRejectedValueOnce(new Error("timeout"));
  expect(await developmentInvitePublication(origin)).toBe("unavailable");
  request.mockResolvedValueOnce(new Response("invalid-json"));
  expect(await developmentInvitePublication(origin)).toBe("unavailable");
});
