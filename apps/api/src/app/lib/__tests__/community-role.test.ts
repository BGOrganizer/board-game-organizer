import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
}));

import { CommunityError } from "../community.error";
import { requireBgoModerator } from "../community-role";

beforeEach(() => vi.resetAllMocks());

describe("fresh moderation authority", () => {
  it("accepts server-owned public metadata only", async () => {
    mocks.getUser.mockResolvedValue({ publicMetadata: { bgoRole: "ADMIN" } });
    await expect(requireBgoModerator("user_moderator")).resolves.toBeUndefined();
    expect(mocks.getUser).toHaveBeenCalledWith("user_moderator");
  });
  it("does not retain an admin snapshot when the role is revoked", async () => {
    mocks.getUser
      .mockResolvedValueOnce({ publicMetadata: { bgoRole: "ADMIN" } })
      .mockResolvedValueOnce({ publicMetadata: {}, unsafeMetadata: { bgoRole: "ADMIN" } });
    await requireBgoModerator("user_moderator");
    await expect(requireBgoModerator("user_moderator")).rejects.toMatchObject({
      status: 403,
      code: "MODERATOR_REQUIRED",
    });
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });
  it("rejects client metadata and incorrect role casing/types", async () => {
    for (const publicMetadata of [
      undefined,
      null,
      [],
      {},
      { bgoRole: "admin" },
      { bgoRole: true },
    ]) {
      mocks.getUser.mockResolvedValue({ publicMetadata, unsafeMetadata: { bgoRole: "ADMIN" } });
      await expect(requireBgoModerator("user_regular")).rejects.toBeInstanceOf(CommunityError);
    }
  });
  it("fails closed if Clerk is unavailable", async () => {
    const failure = new Error("Clerk unavailable");
    mocks.getUser.mockRejectedValue(failure);
    await expect(requireBgoModerator("user_moderator")).rejects.toBe(failure);
  });
});
