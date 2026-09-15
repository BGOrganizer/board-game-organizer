import { Webhook } from "svix";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  withTransaction: vi.fn(async (callback) => callback({ id: "session" }, {})),
}));

vi.mock("@/app/lib/relationship.repository", () => {
  const instance = { deleteAllForUser: vi.fn(async () => undefined) };
  return {
    RelationshipRepository: vi.fn().mockImplementation(() => instance),
    __lastInstance: instance,
  };
});

vi.mock("@/app/lib/users.repository", () => {
  const instance = {
    upsertFromClerk: vi.fn(async () => ({ value: null })),
    deleteByClerkId: vi.fn(async () => ({ deletedCount: 1 })),
  };
  return {
    UsersRepository: vi.fn().mockImplementation(() => instance),
    __lastInstance: instance,
  };
});

import { RelationshipRepository } from "@/app/lib/relationship.repository";
import { UsersRepository } from "@/app/lib/users.repository";

const repoMock = vi.mocked(UsersRepository);
const relationshipRepoMock = vi.mocked(RelationshipRepository);
const relationshipInstance = vi.mocked(
  (await import("@/app/lib/relationship.repository")) as unknown as {
    __lastInstance: { deleteAllForUser: ReturnType<typeof vi.fn> };
  },
).__lastInstance;
const lastInstance = vi.mocked(
  (await import("@/app/lib/users.repository")) as unknown as {
    __lastInstance: {
      upsertFromClerk: ReturnType<typeof vi.fn>;
      deleteByClerkId: ReturnType<typeof vi.fn>;
    };
  },
).__lastInstance;

function sign(payload: object, secret: string) {
  const wh = new Webhook(secret);
  const msgId = "msg_test";
  const timestamp = new Date();
  const signature = wh.sign(msgId, timestamp, JSON.stringify(payload));
  return {
    "svix-id": msgId,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": String(signature),
  };
}

describe("POST /api/webhooks/clerk", () => {
  const secret = "whsec_dGVzdC1zZWNyZXQta2V5LTEyMzQ1Njc4OTA";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLERK_WEBHOOK_SECRET = secret;
  });

  it("rejects when CLERK_WEBHOOK_SECRET is missing", async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(500);
  });

  it("rejects when svix headers are missing", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid signature", async () => {
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ type: "user.created", data: {} }),
        headers: {
          "svix-id": "1",
          "svix-timestamp": String(Math.floor(Date.now() / 1000)),
          "svix-signature": "v1,deadbeef",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(repoMock).not.toHaveBeenCalled();
  });

  it("accepts user.created and upserts the user", async () => {
    const payload = {
      type: "user.created",
      data: {
        id: "user_1",
        first_name: "Alessandro",
        last_name: "Mancini",
        email_addresses: [{ email_address: "a@b.it" }],
        image_url: "https://img/a.png",
        preferred_language: "it",
        public_metadata: { e2e: true },
        unsafe_metadata: { mobileNumber: " +39 123 " },
      },
    };
    const headers = sign(payload, secret);
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: headers as unknown as Record<string, string>,
      }),
    );
    expect(res.status).toBe(200);
    const instance = lastInstance;
    expect(instance.upsertFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user_1",
        email: "a@b.it",
        name: "Alessandro Mancini",
        preferredLanguage: "it",
        mobileNumber: "+39 123",
        e2e: true,
      }),
    );
  });

  it("normalizes unsupported locales to en", async () => {
    const payload = {
      type: "user.updated",
      data: {
        id: "user_2",
        email_addresses: [],
        preferred_language: "fr",
      },
    };
    const headers = sign(payload, secret);
    await POST(new Request("http://x", { method: "POST", body: JSON.stringify(payload), headers }));
    const instance = lastInstance;
    expect(instance.upsertFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "",
        preferredLanguage: "en",
        mobileNumber: null,
        e2e: undefined,
      }),
    );
  });

  it("deletes the user on user.deleted", async () => {
    const payload = { type: "user.deleted", data: { id: "user_3" } };
    const headers = sign(payload, secret);
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify(payload), headers }),
    );
    expect(res.status).toBe(200);
    const instance = lastInstance;
    expect(instance.deleteByClerkId).toHaveBeenCalledWith("user_3");
    expect(relationshipRepoMock).toHaveBeenCalled();
    expect(relationshipInstance.deleteAllForUser).toHaveBeenCalledWith("user_3");
  });

  it("ignores unknown event types", async () => {
    const payload = { type: "session.created", data: {} };
    const headers = sign(payload, secret);
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify(payload), headers }),
    );
    expect(res.status).toBe(200);
    expect(lastInstance.upsertFromClerk).not.toHaveBeenCalled();
    expect(lastInstance.deleteByClerkId).not.toHaveBeenCalled();
  });
});
