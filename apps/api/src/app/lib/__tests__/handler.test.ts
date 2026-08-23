import { beforeAll, describe, expect, it, vi } from "vitest";
import { httpError } from "../handler";

describe("httpError", () => {
  it("creates an Error with an HTTP status attached", () => {
    const err = httpError(404, "User not found");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("User not found");
    expect((err as Error & { status: number }).status).toBe(404);
  });
});

describe("handler helpers", () => {
  it("exposes the expected relationship list types", async () => {
    const { LISTS } = await import("../relationship.lists");
    expect(Object.keys(LISTS)).toEqual([
      "followers",
      "following",
      "friends",
      "pending",
      "sent",
      "blocked",
    ]);
    expect(LISTS.friends).toEqual(["friend", "accepted", "from"]);
    expect(LISTS.blocked).toEqual(["block", "blocked", "from"]);
  });
});

describe("typedMutationHandler", () => {
  const { authMock, withTransactionMock } = vi.hoisted(() => ({
    authMock: vi.fn(),
    withTransactionMock: vi.fn((fn: (session: unknown, db: unknown) => unknown) =>
      fn("session", "db"),
    ),
  }));

  vi.mock("@clerk/nextjs/server", () => ({
    auth: () => authMock(),
  }));

  vi.mock("@/app/lib/db", () => ({
    withTransaction: (fn: (session: unknown, db: unknown) => unknown) => withTransactionMock(fn),
  }));

  let typedMutationHandler: (
    table: Record<
      string,
      (userId: string, targetUserId: string, repo: unknown) => Promise<unknown>
    >,
  ) => (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("../handler");
    typedMutationHandler = mod.typedMutationHandler;
  });

  const post = (type: string, body: unknown) =>
    new Request(`http://localhost/api/relationships?type=${type}`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockReturnValue({ userId: null });
    const handler = typedMutationHandler({ follow: vi.fn() });
    const res = await handler(post("follow", { targetUserId: "user_2" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for an unsupported type", async () => {
    authMock.mockReturnValue({ userId: "user_1" });
    const handler = typedMutationHandler({ follow: vi.fn() });
    const res = await handler(post("nope", { targetUserId: "user_2" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid body", async () => {
    authMock.mockReturnValue({ userId: "user_1" });
    const handler = typedMutationHandler({ follow: vi.fn() });
    const res = await handler(post("follow", {}));
    expect(res.status).toBe(400);
  });

  it("runs the action in a transaction and returns success", async () => {
    authMock.mockReturnValue({ userId: "user_1" });
    const action = vi.fn().mockResolvedValue({ autoAccepted: true });
    const handler = typedMutationHandler({ follow: action });
    const res = await handler(post("follow", { targetUserId: "user_2" }));
    expect(action).toHaveBeenCalledWith("user_1", "user_2", expect.anything());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, autoAccepted: true });
  });

  it("maps action errors to their HTTP status", async () => {
    authMock.mockReturnValue({ userId: "user_1" });
    const action = vi.fn().mockRejectedValue(httpError(404, "User not found"));
    const handler = typedMutationHandler({ follow: action });
    const res = await handler(post("follow", { targetUserId: "user_2" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });
});
