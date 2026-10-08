import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventsService } from "../../events/events.service";
import { requireBgoModerator } from "../../organizations/community-role";
import { OrganizationsService } from "../../organizations/organizations.service";

vi.mock("../../locations/community-location", () => ({
  verifyCommunityLocation: vi.fn(async (location) => location),
}));
vi.mock("../../organizations/community-role", () => ({
  requireBgoModerator: vi.fn(async () => undefined),
}));
vi.mock("../../events/event-deadlines", () => ({ deadlineServiceConfigured: () => true }));
const now = "2026-10-10T12:00:00.000Z";
const organization = {
  id: "organization",
  adminUserId: "admin",
  approved: { name: "Approved", logoAssetId: "logo", location: {} },
  version: 1,
};
const event = {
  id: "event",
  organizationId: "organization",
  adminUserId: "admin",
  name: "Event",
  status: "PUBLISHED",
  bookingClosesAt: now,
  version: 1,
};
function services(overrides: Record<string, unknown> = {}) {
  const events = {
    find: vi.fn(async () => event),
    lock: vi.fn(async () => event),
    liveOrganizationEvents: vi.fn(async () => []),
    ...overrides,
  };
  const organizations = {
    find: vi.fn(async () => organization),
    lock: vi.fn(async () => organization),
    findMembership: vi.fn(async () => null),
    saveMembership: vi.fn(),
    countMembers: vi.fn(async () => 1),
    ...overrides,
  };
  const notifications = { notifyMany: vi.fn() };
  const departure = vi.fn();
  const eventService = new EventsService(
    events as never,
    organizations as never,
    {} as never,
    {} as never,
    {} as never,
    notifications as never,
  );
  const organizationService = new OrganizationsService(
    organizations as never,
    { find: vi.fn(async () => ({ thumbnailBase64: "preview" })) } as never,
    {} as never,
    {} as never,
    notifications as never,
    departure,
  );
  return { events, organizations, notifications, departure, eventService, organizationService };
}
describe("community transaction service invariants", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  });
  afterEach(() => vi.useRealTimers());
  it("rejects every booking mutation at cutoff, including administrator approval", async () => {
    const { eventService } = services({
      findBooking: vi.fn(async () => ({ id: "booking", eventId: "event" })),
    });
    await expect(eventService.book("admin", "event", "table", "member")).rejects.toThrow(
      "EVENT_CLOSED",
    );
    await expect(eventService.bookingAction("admin", "booking", "approve")).rejects.toThrow(
      "EVENT_CLOSED",
    );
    await expect(eventService.cancel("admin", "event")).rejects.toThrow("EVENT_CLOSED");
  });
  it("allows request without any friendship dependency", async () => {
    const { organizationService, organizations, notifications } = services();
    const result = await organizationService.request("outsider", "organization");
    expect(result).toMatchObject({ userId: "outsider", kind: "REQUEST", status: "PENDING" });
    expect(organizations.saveMembership).toHaveBeenCalledWith(result);
    expect(notifications.notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({ recipientUserId: "admin", kind: "organization_join_requested" }),
    ]);
  });
  it("never allows requester to accept their own membership request", async () => {
    const { organizationService } = services({
      findMembership: vi.fn(async () => ({ kind: "REQUEST", status: "PENDING" })),
    });
    await expect(
      organizationService.membershipAction("outsider", "organization", "outsider", "accept"),
    ).rejects.toThrow("INVITATION_RECIPIENT_REQUIRED");
  });
  it("keeps excluded users excluded rather than silently re-requesting", async () => {
    const { organizationService, organizations } = services({
      findMembership: vi.fn(async () => ({ status: "EXCLUDED" })),
    });
    await expect(organizationService.request("outsider", "organization")).rejects.toThrow(
      "ORGANIZATION_EXCLUDED",
    );
    expect(organizations.saveMembership).not.toHaveBeenCalled();
  });
  it("requires fresh moderator authority before returning a private proposal", async () => {
    const proposal = { name: "Private proposal", logoAssetId: "logo", location: {} };
    const { organizationService } = services({
      find: vi.fn(async () => ({ ...organization, proposal, reviewStatus: "PENDING" })),
    });
    await expect(
      organizationService.moderationDetail("moderator", "organization"),
    ).resolves.toMatchObject({ proposal });
    expect(requireBgoModerator).toHaveBeenCalledWith("moderator");
    vi.mocked(requireBgoModerator).mockRejectedValueOnce(new Error("MODERATOR_REQUIRED"));
    await expect(
      organizationService.moderationDetail("former-moderator", "organization"),
    ).rejects.toThrow("MODERATOR_REQUIRED");
    await expect(
      organizationService.detail("outsider", "organization"),
    ).resolves.not.toHaveProperty("proposal");
  });

  it("never cancels frozen postdeadline participation on departure", async () => {
    const { eventService, events } = services();
    await eventService.membershipDeparted("organization", "member");
    expect(events.lock).not.toHaveBeenCalled();
  });
  it("rejects stale deadline messages without touching tables", async () => {
    const { eventService } = services();
    await expect(eventService.close("event", 2)).resolves.toEqual({ closed: false });
  });
});
