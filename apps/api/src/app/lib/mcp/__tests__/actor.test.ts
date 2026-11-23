import { auth } from "@clerk/nextjs/server";
import { expect, it, vi } from "vitest";
import { bgoAuth, withMcpActor } from "../actor";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_session", isAuthenticated: true })),
}));

it("retains ordinary Clerk session auth outside the MCP request", async () => {
  expect(await bgoAuth()).toEqual({ userId: "user_session", isAuthenticated: true });
  expect(auth).toHaveBeenCalledOnce();
});

it("isolates two concurrent OAuth actors and clears the context after each request", async () => {
  const getActor = async (id: string) =>
    withMcpActor(id, async () => {
      await Promise.resolve();
      return bgoAuth();
    });
  expect(await Promise.all([getActor("user_a"), getActor("user_b")])).toEqual([
    { userId: "user_a", isAuthenticated: true },
    { userId: "user_b", isAuthenticated: true },
  ]);
  expect((await bgoAuth()).userId).toBe("user_session");
});
