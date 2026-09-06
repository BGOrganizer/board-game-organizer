import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("../load-env");
  vi.doUnmock("@clerk/nextjs/server");
  vi.doUnmock("../../src/app/lib/db");
  vi.doUnmock("../../src/app/lib/users.repository");
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("loads the secret before importing Clerk in the backfill entrypoint", async () => {
  vi.resetModules();
  vi.stubEnv("CLERK_SECRET_KEY", "");
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  const getUserList = vi.fn(async () => ({ data: [] }));

  vi.doMock("../load-env", () => ({
    loadApiEnv: () => {
      process.env.CLERK_SECRET_KEY = "fixture-only";
    },
  }));
  vi.doMock("@clerk/nextjs/server", () => {
    // Clerk snapshots environment values at module evaluation, not at first request.
    const secretAtImport = process.env.CLERK_SECRET_KEY;
    return {
      clerkClient: async () => {
        expect(secretAtImport).toBe("fixture-only");
        return { users: { getUserList } };
      },
    };
  });
  vi.doMock("../../src/app/lib/db", () => ({ getDb: async () => ({}) }));
  vi.doMock("../../src/app/lib/users.repository", () => ({
    UsersRepository: class UsersRepository {},
  }));

  await import("../backfill-users");
  await vi.waitFor(() => expect(exit).toHaveBeenCalled());
  expect(exit).toHaveBeenCalledWith(0);
  expect(error).not.toHaveBeenCalled();
  expect(getUserList).toHaveBeenCalledWith({ limit: 100, offset: 0 });
});
