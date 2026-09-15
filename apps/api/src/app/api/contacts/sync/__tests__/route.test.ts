import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPTIONS, POST } from "../route";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(),
  COLLECTIONS: { USERS: "users", CONTACT_LINKS: "contactLinks" },
}));

import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/app/lib/db";

const authMock = vi.mocked(auth as unknown as () => Promise<{ userId: string | null }>);
const getDbMock = vi.mocked(getDb as unknown as () => Promise<ReturnType<typeof fakeDb>["db"]>);

function fakeDb(
  users: Array<{
    clerkId: string;
    email: string;
    mobileNumberNormalized?: string;
  }> = [],
) {
  const userFind = vi.fn(() => ({ toArray: vi.fn(async () => users) }));
  const deleteMany = vi.fn(async () => ({ deletedCount: 0 }));
  const insertMany = vi.fn(async () => ({ insertedCount: users.length }));
  const db = {
    collection: vi.fn((name: string) =>
      name === "users"
        ? { find: userFind }
        : {
            deleteMany,
            insertMany,
            find: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
          },
    ),
  };
  return { db, userFind, deleteMany, insertMany };
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
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed contact data", async () => {
    const res = await POST(
      new Request("http://localhost/api/contacts/sync", {
        method: "POST",
        body: JSON.stringify({ emails: ["not-an-email"] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("matches unique registered emails and normalized phones only", async () => {
    const database = fakeDb([
      { clerkId: "user_1", email: "self@example.com", mobileNumberNormalized: "391111111111" },
      { clerkId: "user_email", email: "friend@example.com" },
      {
        clerkId: "user_phone",
        email: "phone@example.com",
        mobileNumberNormalized: "393331234567",
      },
      {
        clerkId: "user_duplicate_1",
        email: "one@example.com",
        mobileNumberNormalized: "3900001",
      },
      {
        clerkId: "user_duplicate_2",
        email: "two@example.com",
        mobileNumberNormalized: "3900001",
      },
      {
        clerkId: "user_unmatched",
        email: "other@example.com",
        mobileNumberNormalized: "399999999999",
      },
    ]);
    getDbMock.mockResolvedValue(database.db);

    const res = await POST(
      new Request("http://localhost/api/contacts/sync", {
        method: "POST",
        body: JSON.stringify({
          emails: [" FRIEND@example.com "],
          phoneNumbers: ["+39 333 123 4567", "0039 333 123 4567", "3900001", "+39 111 111 1111"],
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stored: 2,
      users: [
        { contactClerkId: "user_email", email: "friend@example.com" },
        { contactClerkId: "user_phone", email: "phone@example.com" },
      ],
    });
    expect(database.userFind).toHaveBeenCalledWith(
      {
        $or: [
          { email: { $in: ["friend@example.com"] } },
          {
            mobileNumberNormalized: { $in: ["393331234567", "3900001", "391111111111"] },
          },
        ],
      },
      { projection: { _id: 0, clerkId: 1, email: 1, mobileNumberNormalized: 1 } },
    );
    expect(database.deleteMany).toHaveBeenCalledWith({ userId: "user_1" });
    expect(database.insertMany).toHaveBeenCalledOnce();
  });

  it("keeps email-only clients compatible", async () => {
    const database = fakeDb([{ clerkId: "user_email", email: "friend@example.com" }]);
    getDbMock.mockResolvedValue(database.db);

    const res = await POST(
      new Request("http://localhost/api/contacts/sync", {
        method: "POST",
        body: JSON.stringify({ emails: ["friend@example.com"] }),
      }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).stored).toBe(1);
  });

  it("clears stale links when address book has no matchable values", async () => {
    const database = fakeDb();
    getDbMock.mockResolvedValue(database.db);

    const res = await POST(
      new Request("http://localhost/api/contacts/sync", {
        method: "POST",
        body: JSON.stringify({ phoneNumbers: ["not a number"] }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: 0, users: [] });
    expect(database.userFind).not.toHaveBeenCalled();
    expect(database.deleteMany).toHaveBeenCalledWith({ userId: "user_1" });
    expect(database.insertMany).not.toHaveBeenCalled();
  });
});

describe("OPTIONS /api/contacts/sync", () => {
  it("returns CORS preflight response", async () => {
    const res = await OPTIONS(new Request("http://localhost/api/contacts/sync"));
    expect(res.status).toBe(204);
  });
});
