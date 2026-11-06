import { beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "@/app/lib/community.error";
import { GET, OPTIONS } from "../route";

const m = vi.hoisted(() => ({ auth: vi.fn(), page: vi.fn(), visible: vi.fn() }));
vi.mock("@/app/lib/profile/profile.service", () => ({
  ProfileService: class {
    requireVisible = m.visible;
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: async () => ({}) }));
vi.mock("@/app/lib/games/bgg-account.repository", () => ({
  BggAccountRepository: class {
    page = m.page;
  },
}));
const data = {
  snapshot: "snap",
  counts: { withoutExpansions: 1, withExpansions: 2, wishlist: 1 },
  items: [],
  nextCursor: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ userId: "owner" });
  m.page.mockResolvedValue(data);
  m.visible.mockResolvedValue({ clerkId: "subject" });
});
it("allows an authenticated visible subject, never provider controls, and rechecks access after paging", async () => {
  const response = await GET(
    new Request(
      "https://api.test/api/bgg/collection?snapshot=snap&subjectId=guest&types=expansions&wishlist=true&commonSnapshot=viewer",
    ),
  );
  expect(response.status).toBe(200);
  expect(m.page).toHaveBeenCalledWith(
    "guest",
    {
      snapshot: "snap",
      subjectId: "guest",
      types: "expansions",
      wishlist: "true",
      commonSnapshot: "viewer",
      query: "",
      limit: 25,
    },
    "owner",
  );
  expect(m.visible.mock.calls).toEqual([
    ["owner", "guest"],
    ["owner", "guest"],
  ]);
});
it.each([false, true])(
  "blocks a denied foreign profile before or after page read: late=%s",
  async (late) => {
    if (late) m.visible.mockResolvedValueOnce({});
    m.visible.mockRejectedValue(new CommunityError(404, "PROFILE_NOT_FOUND"));
    const response = await GET(
      new Request("https://api.test/api/bgg/collection?snapshot=snap&subjectId=guest"),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "PROFILE_NOT_FOUND" });
    expect(m.page).toHaveBeenCalledTimes(late ? 1 : 0);
  },
);
it("requires authentication", async () => {
  m.auth.mockResolvedValue({ userId: null });
  expect((await GET(new Request("https://api.test/api/bgg/collection?snapshot=snap"))).status).toBe(
    401,
  );
  expect(m.page).not.toHaveBeenCalled();
});
it.each(["", "snapshot=snap&limit=51", "snapshot=snap&userId=foreign"])(
  "rejects invalid/foreign query input %s",
  async (query) => {
    expect((await GET(new Request(`https://api.test/api/bgg/collection?${query}`))).status).toBe(
      400,
    );
    expect(m.page).not.toHaveBeenCalled();
  },
);
it("delegates only the authenticated owner's validated page and preserves CORS", async () => {
  const response = await GET(
    new Request("https://api.test/api/bgg/collection?snapshot=snap&query=A&limit=1"),
  );
  expect(await response.json()).toEqual(data);
  expect(m.page).toHaveBeenCalledWith("owner", { snapshot: "snap", query: "A", limit: 1 }, "owner");
  expect(
    (await OPTIONS(new Request("https://api.test/api/bgg/collection", { method: "OPTIONS" })))
      .status,
  ).toBe(204);
});
it.each([400, 404, 409])("preserves domain status %s", async (status) => {
  m.page.mockRejectedValue(new CommunityError(status, "TEST_COLLECTION_ERROR"));
  const response = await GET(new Request("https://api.test/api/bgg/collection?snapshot=snap"));
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: "TEST_COLLECTION_ERROR" });
});
it("does not expose unexpected exception details", async () => {
  m.page.mockRejectedValue(new Error("private provider content"));
  const response = await GET(new Request("https://api.test/api/bgg/collection?snapshot=snap"));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "BGG_COLLECTION_UNAVAILABLE" });
});
