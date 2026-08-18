import { describe, expect, it, vi } from "vitest";
import { enrichRelationships, enrichSingleUser, enrichUserIds, toProfile } from "../clerk";

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
}));

const clerkClientMock = vi.mocked(
  (await import("@clerk/nextjs/server")).clerkClient as unknown as ReturnType<typeof vi.fn>,
);

describe("toProfile", () => {
  it("maps a Clerk user to the local Profile shape", () => {
    const profile = toProfile({
      id: "user_1",
      firstName: "Alessandro",
      lastName: "Mancini",
      username: "alex",
      imageUrl: "https://img/a.png",
      emailAddresses: [{ emailAddress: "a@b.it" }],
    });
    expect(profile).toEqual({
      id: "user_1",
      fullName: "Alessandro Mancini",
      username: "alex",
      imageUrl: "https://img/a.png",
      emailAddress: "a@b.it",
    });
  });

  it("handles missing name parts and emails", () => {
    const profile = toProfile({
      id: "user_2",
      firstName: null,
      lastName: null,
      username: null,
      imageUrl: "",
      emailAddresses: [],
    });
    expect(profile.fullName).toBeNull();
    expect(profile.username).toBeNull();
    expect(profile.emailAddress).toBeNull();
  });
});

describe("enrichUserIds", () => {
  it("returns an empty list for no ids", async () => {
    expect(await enrichUserIds([])).toEqual([]);
    expect(clerkClientMock).not.toHaveBeenCalled();
  });

  it("chunks ids into groups of 100 and flattens the results", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `user_${i}`);
    clerkClientMock.mockReturnValue({
      users: {
        getUserList: vi
          .fn()
          .mockResolvedValueOnce({
            data: ids
              .slice(0, 100)
              .map((id) => ({ id, firstName: "A", imageUrl: "", emailAddresses: [] })),
          })
          .mockResolvedValueOnce({
            data: ids
              .slice(100)
              .map((id) => ({ id, firstName: "B", imageUrl: "", emailAddresses: [] })),
          }),
      },
    });

    const profiles = await enrichUserIds(ids);
    expect(profiles).toHaveLength(150);
    expect(clerkClientMock.mock.calls).toHaveLength(1);
  });
});

describe("enrichSingleUser", () => {
  it("returns the profile when the user exists", async () => {
    clerkClientMock.mockReturnValue({
      users: {
        getUser: vi.fn().mockResolvedValue({ id: "user_1", firstName: "A", emailAddresses: [] }),
      },
    });
    const profile = await enrichSingleUser("user_1");
    expect(profile?.id).toBe("user_1");
  });

  it("returns null when Clerk fails (e.g. deleted user)", async () => {
    clerkClientMock.mockReturnValue({
      users: { getUser: vi.fn().mockRejectedValue(new Error("not found")) },
    });
    expect(await enrichSingleUser("user_ghost")).toBeNull();
  });
});

describe("enrichRelationships", () => {
  it("attaches the other-side profile to each relationship", async () => {
    clerkClientMock.mockReturnValue({
      users: {
        getUserList: vi.fn().mockResolvedValue({
          data: [
            { id: "user_2", firstName: "Bob", lastName: null, imageUrl: "", emailAddresses: [] },
            { id: "user_3", firstName: "Carla", lastName: null, imageUrl: "", emailAddresses: [] },
          ],
        }),
      },
    });

    const relationships = [
      { fromUserId: "user_1", toUserId: "user_2", type: "follow" },
      { fromUserId: "user_3", toUserId: "user_1", type: "follow" },
    ];
    const enriched = await enrichRelationships(relationships as never, "user_1");
    expect(enriched[0].profile?.fullName).toBe("Bob");
    expect(enriched[1].profile?.fullName).toBe("Carla");
  });
});
