import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  upsertFromClerk: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ users: { getUser: mocks.getUser } })),
}));
vi.mock("@/app/lib/users.repository", () => ({
  UsersRepository: class {
    findById = mocks.findById;
    upsertFromClerk = mocks.upsertFromClerk;
  },
}));

import { ensureCurrentUser } from "../ensureCurrentUser";

const db = {} as Parameters<typeof ensureCurrentUser>[1];

describe("ensureCurrentUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findById.mockResolvedValue(null);
    mocks.getUser.mockResolvedValue({
      id: "user_actor",
      emailAddresses: [{ emailAddress: "actor@example.com" }],
      firstName: "Alex",
      lastName: "Smith",
      imageUrl: "https://example.com/avatar.png",
      unsafeMetadata: { mobileNumber: "+39123456789" },
      publicMetadata: { e2e: true },
    });
  });

  it("skips Clerk when mirror is complete", async () => {
    mocks.findById.mockResolvedValue({ email: "actor@example.com", name: "Alex" });
    await ensureCurrentUser("user_actor", db);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.upsertFromClerk).not.toHaveBeenCalled();
  });

  it("upserts missing caller from Clerk, including mobile number", async () => {
    await ensureCurrentUser("user_actor", db);
    expect(mocks.getUser).toHaveBeenCalledWith("user_actor");
    expect(mocks.upsertFromClerk).toHaveBeenCalledWith({
      id: "user_actor",
      email: "actor@example.com",
      name: "Alex Smith",
      avatarUrl: "https://example.com/avatar.png",
      mobileNumber: "+39123456789",
      preferredLanguage: "en",
      e2e: true,
    });
  });

  it("repairs incomplete presence-only mirror and handles empty names", async () => {
    mocks.findById.mockResolvedValue({ email: "", name: "" });
    mocks.getUser.mockResolvedValue({
      id: "user_actor",
      emailAddresses: [{ emailAddress: "actor@example.com" }],
      firstName: null,
      lastName: null,
      imageUrl: "",
      unsafeMetadata: {},
      publicMetadata: {},
    });
    await ensureCurrentUser("user_actor", db);
    expect(mocks.upsertFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({ name: "actor@example.com", mobileNumber: null, e2e: undefined }),
    );
  });

  it("handles Clerk accounts without an email address", async () => {
    mocks.getUser.mockResolvedValue({
      id: "user_actor",
      emailAddresses: [],
      firstName: "Alex",
      lastName: null,
      imageUrl: "",
      unsafeMetadata: {},
      publicMetadata: {},
    });
    await ensureCurrentUser("user_actor", db);
    expect(mocks.upsertFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({ email: "", name: "Alex" }),
    );
  });

  it("does not create Mongo user if Clerk lookup fails", async () => {
    mocks.getUser.mockRejectedValue(new Error("Clerk unavailable"));
    await expect(ensureCurrentUser("user_actor", db)).rejects.toThrow("Clerk unavailable");
    expect(mocks.upsertFromClerk).not.toHaveBeenCalled();
  });
});
