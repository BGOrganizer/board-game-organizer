import { developmentInviteAppLink } from "@board-game-organizer/shared";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "../../../development/invite/[token]/route";
import { developmentInvitePublication } from "../development-invite-publication";

vi.mock("../development-invite-publication", () => ({
  developmentInvitePublication: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(developmentInvitePublication).mockReset().mockResolvedValue("eligible");
});

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
  expect(developmentInvitePublication).toHaveBeenCalledWith(new URL(target).origin);
});
it.each(["ineligible", "unavailable"] as const)(
  "fails closed when publication is %s without redirecting",
  async (status) => {
    vi.mocked(developmentInvitePublication).mockResolvedValue(status);
    const response = await GET(new Request(developmentInviteAppLink(target)!), {
      params: Promise.resolve({ token }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ error: "INVITE_DESTINATION_UNAVAILABLE" });
  },
);
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
  expect(developmentInvitePublication).not.toHaveBeenCalled();
});
