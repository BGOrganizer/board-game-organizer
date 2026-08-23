import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const contactClerkIdsForUser = vi.fn(async () => [] as string[]);

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(),
  COLLECTIONS: {
    USERS: "users",
    BLOCKS: "blocks",
    FOLLOWS: "follows",
    CONTACT_LINKS: "contactLinks",
  },
}));
vi.mock("@/app/lib/contacts.repository", () => ({
  ContactLinksRepository: class {
    contactClerkIdsForUser = contactClerkIdsForUser;
  },
}));

import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/app/lib/db";

const authMock = vi.mocked(auth as unknown as () => Promise<{ userId: string | null }>);
const getDbMock = vi.mocked(
  getDb as unknown as () => Promise<{ collection: ReturnType<typeof vi.fn> }>,
);

function fakeDb() {
  return {
    collection: vi.fn(() => ({
      find: vi.fn(() => ({ toArray: async () => [] })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "user_1" });
  getDbMock.mockResolvedValue(fakeDb() as never);
  contactClerkIdsForUser.mockResolvedValue([]);
});

describe("GET /api/users/suggestions", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns an empty list with hasContacts=false when no contacts were synced", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ users: [], nextCursor: null, hasContacts: false });
  });

  it("returns only synced contacts (hasContacts=true)", async () => {
    contactClerkIdsForUser.mockResolvedValue(["user_b"]);
    const db = {
      collection: vi.fn((name: string) => {
        if (name === "users") {
          return {
            find: vi.fn(() => ({
              toArray: async () => [
                {
                  clerkId: "user_b",
                  name: "Bob",
                  email: "b@bgo.it",
                  avatarUrl: null,
                  presence: { online: false, lastActiveAt: new Date() },
                },
              ],
            })),
          };
        }
        return { find: vi.fn(() => ({ toArray: async () => [] })) };
      }),
    };
    getDbMock.mockResolvedValue(db as never);
    const res = await GET();
    const body = await res.json();
    expect(body.hasContacts).toBe(true);
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe("user_b");
  });
});
