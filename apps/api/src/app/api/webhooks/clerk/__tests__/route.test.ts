import { Webhook } from "svix";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, withTransaction } from "@/app/lib/db";
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

vi.mock("@/app/lib/notifications.repository", () => {
  const instance = { deleteForUser: vi.fn(async () => undefined) };
  return {
    NotificationsRepository: vi.fn().mockImplementation(() => instance),
    __lastInstance: instance,
  };
});

vi.mock("@/app/lib/users.repository", () => {
  const instance = {
    upsertFromClerk: vi.fn(async () => ({ value: null })),
    findById: vi.fn(async () => ({ clerkId: "user_3" })),
    deleteByClerkId: vi.fn(async () => ({ deletedCount: 1 })),
  };
  return {
    UsersRepository: vi.fn().mockImplementation(() => instance),
    __lastInstance: instance,
  };
});

import { NotificationsRepository } from "@/app/lib/notifications.repository";
import { RelationshipRepository } from "@/app/lib/relationship.repository";
import { UsersRepository } from "@/app/lib/users.repository";

const repoMock = vi.mocked(UsersRepository);
const notificationRepoMock = vi.mocked(NotificationsRepository);
const relationshipRepoMock = vi.mocked(RelationshipRepository);
const notificationInstance = vi.mocked(
  (await import("@/app/lib/notifications.repository")) as unknown as {
    __lastInstance: { deleteForUser: ReturnType<typeof vi.fn> };
  },
).__lastInstance;
const relationshipInstance = vi.mocked(
  (await import("@/app/lib/relationship.repository")) as unknown as {
    __lastInstance: { deleteAllForUser: ReturnType<typeof vi.fn> };
  },
).__lastInstance;
const lastInstance = vi.mocked(
  (await import("@/app/lib/users.repository")) as unknown as {
    __lastInstance: {
      upsertFromClerk: ReturnType<typeof vi.fn>;
      findById: ReturnType<typeof vi.fn>;
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
    process.env.MONGODB_DB_NAME = "bgo_ci_12_1";
    process.env.CLERK_WEBHOOK_DB_NAME = "bgo_dev";
    lastInstance.findById.mockResolvedValue({ clerkId: "user_3" });
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
        public_metadata: { e2e: false },
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
        e2e: undefined,
      }),
    );
    expect(getDb).toHaveBeenCalledWith("bgo_dev");
  });

  it.each(["bgo_ci_12_1", "bgo_dev"])(
    "ignores verified E2E events from %s while ordinary users go to dev DB",
    async (appDb) => {
      process.env.MONGODB_DB_NAME = appDb;
      const payload = {
        type: "user.created",
        data: { id: "user_ci", public_metadata: { e2e: true } },
      };
      const res = await POST(
        new Request("http://x", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: sign(payload, secret),
        }),
      );
      expect(res.status).toBe(200);
      expect(getDb).not.toHaveBeenCalled();
      expect(lastInstance.upsertFromClerk).not.toHaveBeenCalled();
    },
  );

  it("retains production E2E mirroring without a webhook DB override", async () => {
    delete process.env.CLERK_WEBHOOK_DB_NAME;
    process.env.MONGODB_DB_NAME = "bgo_prod";
    const payload = {
      type: "user.updated",
      data: { id: "user_ci", public_metadata: { e2e: true } },
    };
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: sign(payload, secret),
      }),
    );
    expect(res.status).toBe(200);
    expect(lastInstance.upsertFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({ e2e: true }),
    );
    expect(getDb).toHaveBeenCalledWith("bgo_prod");
  });

  it.each([undefined, "bgo_ci_12_1", "bgo_ci_99_1"])(
    "rejects webhook routing to E2E DB %s",
    async (webhookName) => {
      if (webhookName) process.env.CLERK_WEBHOOK_DB_NAME = webhookName;
      else delete process.env.CLERK_WEBHOOK_DB_NAME;
      const payload = { type: "user.created", data: { id: "user_dev" } };
      const res = await POST(
        new Request("http://x", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: sign(payload, secret),
        }),
      );
      expect(res.status).toBe(503);
      expect(getDb).not.toHaveBeenCalled();
    },
  );

  it("rejects missing database configuration", async () => {
    delete process.env.MONGODB_DB_NAME;
    delete process.env.CLERK_WEBHOOK_DB_NAME;
    const payload = { type: "user.created", data: { id: "user_dev" } };
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: sign(payload, secret),
      }),
    );
    expect(res.status).toBe(503);
    expect(getDb).not.toHaveBeenCalled();
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
    expect(getDb).toHaveBeenCalledWith("bgo_dev");
    expect(withTransaction).toHaveBeenCalledWith(expect.any(Function), "bgo_dev");
    expect(relationshipRepoMock).toHaveBeenCalled();
    expect(relationshipInstance.deleteAllForUser).toHaveBeenCalledWith("user_3");
    expect(notificationRepoMock).toHaveBeenCalled();
    expect(notificationInstance.deleteForUser).toHaveBeenCalledWith("user_3");
  });

  it("skips E2E deletions when no user was mirrored into dev", async () => {
    lastInstance.findById.mockResolvedValueOnce(null);
    const payload = { type: "user.deleted", data: { id: "user_ci" } };
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: sign(payload, secret),
      }),
    );
    expect(res.status).toBe(200);
    expect(withTransaction).not.toHaveBeenCalled();
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
