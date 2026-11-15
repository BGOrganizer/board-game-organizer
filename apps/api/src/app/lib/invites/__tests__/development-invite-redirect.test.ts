import { developmentInviteAppLink } from "@board-game-organizer/shared";
import { expect, it } from "vitest";
import { GET } from "../../../development/invite/[token]/route";

const token = "abcdefghijklmnopqrstuv";
const target = `https://api-development-pr-25-board-game-organizers-projects.vercel.app/invite/${token}`;
it("redirects the browser to its exact owned Development claim page without granting consent", async () => {
  const response = await GET(new Request(developmentInviteAppLink(target)!), {
    params: Promise.resolve({ token }),
  });
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(target);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
});
it.each([
  "",
  "?web=https://evil.test/",
  `?web=${encodeURIComponent(target)}&web=${encodeURIComponent(target)}`,
  `?web=${encodeURIComponent(target.replace(token, "different-token"))}`,
])("rejects missing, duplicate, arbitrary and token-mismatched fallbacks (%s)", async (query) => {
  const response = await GET(
    new Request(`https://api.board-game-organizer.com/development/invite/${token}${query}`),
    { params: Promise.resolve({ token }) },
  );
  expect(response.status).toBe(400);
  expect(response.headers.get("Location")).toBeNull();
  expect(await response.json()).toEqual({ error: "INVALID_INVITE_LINK" });
});
