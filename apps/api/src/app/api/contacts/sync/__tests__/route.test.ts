import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(),
  COLLECTIONS: { USERS: "users", CONTACT_LINKS: "contactLinks" },
}));

import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/app/lib/db";

const authMock = vi.mocked(auth as unknown as () => Promise<{ userId: string | null }>);
const getDbMock = vi.mocked(
  getDb as unknown as () => Promise<{
    collection: ReturnType<typeof vi.fn>;
  }>,
);

function fakeDb() {
  const calls: Record<string, unknown[]> = {};
  const col = (name: string) => {
    calls[name] = calls[name] ?? [];
    return {
      find: vi.fn(() => ({ toArray: async () => [] })),
      deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
      insertMany: vi.fn(async () => ({ insertedCount: 0 })),
      findOneAndUpdate: vi.fn(async () => ({ value: null })),
    };
  };
  const db = { collection: vi.fn((name: string) => col(name)) };
  return { db, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "user_1" });
});

describe("POST /api/contacts/sync", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await POST(
      new Request("http://localhost/api/contacts/sync", {
        method: "POST",
        body: JSON.stringify({ emails: ["a@b.it"] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid payload", async () => {
    const res = await POST(
      new Request("http://localhost/api/contacts/sync", {
        method: "POST",
        body: JSON.stringify({ emails: ["not-an-email"] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("matches registered users and persists the links (replace semantics)", async () => {
    const { db } = fakeDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collectionMock = db.collection as unknown as ReturnType<typeof vi.fn>;
    collectionMock.mockImplementation((name: string) => {
      if (name === "users") {
        return {
          find: vi.fn(() => ({
            toArray: async () => [{ clerkId: "user_b", email: "b@bgo.it" }],
          })),
        };
      }
      return {
        find: vi.fn(() => ({ toArray: async () => [] })),
        deleteMany: vi.fn(async () => ({ deletedCount: 1 })),
        insertMany: vi.fn(async () => ({ insertedCount: 1 })),
      };
    });
    getDbMock.mockResolvedValue(db as never);

    const res = await POST(
      new Request("http://localhost/api/contacts/sync", {
        method: "POST",
        body: JSON.stringify({ emails: ["B@BGO.IT", "not-registered@x.it"] }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stored).toBe(1);
    expect(body.users).toEqual([{ contactClerkId: "user_b", email: "b@bgo.it" }]);
    // replace semantics: delete old links, insert the new matches only
    expect(db.collection).toHaveBeenCalledWith("contactLinks");
  });
});
