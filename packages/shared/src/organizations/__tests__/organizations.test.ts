import type {
  OrganizationMemberResponse,
  OrganizationResponse,
} from "@board-game-organizer/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommunityApiError,
  communityAccessDenied,
  communityPagePath,
  communityRequest,
} from "../../community/communityApi";
import {
  COMMUNITY_FEEDBACK_MESSAGES,
  communityFeedbackMessages,
} from "../../community/communityFeedback";
import { patchOrganizationData } from "../hooks/useOrganizations";
import {
  isDestructiveOrganizationAction,
  organizationActionLabel,
  organizationActionMessage,
  organizationMemberActions,
  ownOrganizationActions,
} from "../organizationActions";

const organization = {
  id: "org",
  role: "admin",
  name: "Board Club",
  approved: { name: "Board Club" },
} as OrganizationResponse;
const member = (status: string, kind = "REQUEST", isAdmin = false) =>
  ({ userId: "person", isAdmin, membership: { status, kind } }) as OrganizationMemberResponse;
afterEach(() => vi.unstubAllGlobals());
describe("organization action policy", () => {
  it("gates own requests and invitations without granting administrator actions", () => {
    for (const [role, actions] of [
      ["admin", []],
      ["excluded", []],
      ["invited", ["accept", "decline"]],
      ["accepted", ["cancel"]],
      ["requested", ["cancel"]],
      ["none", ["request"]],
    ] as const) {
      expect(ownOrganizationActions({ ...organization, role })).toEqual(actions);
    }
    expect(ownOrganizationActions({ ...organization, role: "none", approved: undefined })).toEqual(
      [],
    );
  });
  it("never removes creator and distinguishes requester from invitee", () => {
    expect(
      organizationMemberActions({ ...organization, role: "accepted" }, member("ACCEPTED")),
    ).toEqual([]);
    expect(organizationMemberActions(organization, member("ACCEPTED", "INVITATION", true))).toEqual(
      [],
    );
    expect(
      organizationMemberActions(organization, { ...member("ACCEPTED"), membership: null }),
    ).toEqual([]);
    expect(organizationMemberActions(organization, member("PENDING"))).toEqual([
      "approve",
      "reject",
      "remove",
      "ban",
    ]);
    expect(organizationMemberActions(organization, member("PENDING", "INVITATION"))).toEqual([
      "remove",
      "ban",
    ]);
    expect(organizationMemberActions(organization, member("ACCEPTED"))).toEqual(["remove", "ban"]);
    expect(organizationMemberActions(organization, member("EXCLUDED"))).toEqual(["revoke"]);
    expect(organizationMemberActions(organization, member("LEFT"))).toEqual([]);
  });
  it("uses stable descriptors and distinguishes withdrawal from leaving", () => {
    expect(organizationActionMessage("cancel", "requested")).toEqual({
      id: "organization.action.cancel.request",
      message: "Cancel request",
    });
    expect(organizationActionMessage("cancel", "accepted")).toEqual({
      id: "organization.action.cancel.leave",
      message: "Leave organization",
    });
    for (const action of [
      "request",
      "accept",
      "decline",
      "approve",
      "reject",
      "remove",
      "ban",
      "revoke",
    ] as const) {
      expect(organizationActionMessage(action).message).toBe(organizationActionLabel(action));
      expect(isDestructiveOrganizationAction(action)).toBe(action === "remove" || action === "ban");
    }
    expect(isDestructiveOrganizationAction("cancel")).toBe(true);
  });
  it("translates each operation and its own error using stable ids", () => {
    const translate = vi.fn((id, message) => `${id}:${message}`);
    const messages = communityFeedbackMessages(translate);
    expect(Object.keys(messages)).toEqual(Object.keys(COMMUNITY_FEEDBACK_MESSAGES));
    expect(translate).toHaveBeenCalledTimes(Object.keys(COMMUNITY_FEEDBACK_MESSAGES).length * 2);
    expect(messages.leave_organization.error).toBe(
      "organization.feedback.leave_organization.error:Could not cancel organization membership",
    );
  });
});
describe("owned community cache transforms", () => {
  const patch = (row: OrganizationResponse) => ({ ...row, name: "Changed" });
  it("patches immutable details and pages without touching unsupported data", () => {
    const source = { pages: [{ items: [organization], nextCursor: "next" }], pageParams: [""] };
    expect(patchOrganizationData(source, patch)).toEqual({
      ...source,
      pages: [{ items: [{ ...organization, name: "Changed" }], nextCursor: "next" }],
    });
    expect(source.pages[0].items[0].name).toBe("Board Club");
    expect(patchOrganizationData(organization, patch)).toEqual({
      ...organization,
      name: "Changed",
    });
    expect(patchOrganizationData(organization, () => null)).toBe(organization);
    expect(patchOrganizationData(source, () => null)).toEqual({
      ...source,
      pages: [{ items: [], nextCursor: "next" }],
    });
    for (const value of [null, undefined, "text", [], {}, { pages: "invalid" }])
      expect(patchOrganizationData(value, patch)).toBe(value);
  });
});
describe("fresh scoped community requests", () => {
  const options = {
    apiUrl: "https://api.test",
    userId: "user",
    getToken: vi.fn(async () => "fresh-token"),
  };
  it("resolves token immediately before each call and supports protection bypass", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "server-id" })));
    vi.stubGlobal("fetch", fetch);
    await communityRequest({ ...options, protectionBypass: "bypass" }, "organizations?scope=mine");
    await communityRequest(options, "organizations", "POST", { name: "Club" });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://api.test/api/organizations?scope=mine&x-vercel-protection-bypass=bypass",
      expect.objectContaining({
        headers: { Authorization: "Bearer fresh-token", "Content-Type": "application/json" },
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.test/api/organizations",
      expect.objectContaining({ method: "POST", body: '{"name":"Club"}' }),
    );
  });
  it("fails closed on identity, token and cancelled requests", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(communityRequest({ ...options, userId: null }, "organizations")).rejects.toThrow(
      "Unauthorized",
    );
    await expect(
      communityRequest({ ...options, getToken: async () => null }, "organizations"),
    ).rejects.toThrow("Unauthorized");
    const controller = new AbortController();
    controller.abort();
    await expect(
      communityRequest(options, "organizations", "GET", undefined, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { body: JSON.stringify({ error: "ORGANIZATION_CHANGED" }), code: "ORGANIZATION_CHANGED" },
    { body: "bad json", code: "HTTP 409" },
    { body: JSON.stringify({ error: 0 }), code: "HTTP 409" },
  ])("preserves failure $code", async ({ body, code }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 409 })),
    );
    await expect(communityRequest(options, "organizations")).rejects.toMatchObject({
      status: 409,
      code,
    });
  });
  it("separates revoked access from recoverable failures", () => {
    for (const status of [401, 403, 404])
      expect(communityAccessDenied(new CommunityApiError(status, "Denied"))).toBe(true);
    for (const error of [new CommunityApiError(500, "Server"), new Error("Offline"), null])
      expect(communityAccessDenied(error)).toBe(false);
  });
  it("encodes query/cursor and ignores undersized searches", () => {
    expect(communityPagePath("organizations", "abc", "")).toBe("organizations?limit=20");
    expect(communityPagePath("organizations?scope=public", "club", "a|b")).toBe(
      "organizations?scope=public&limit=20&query=club&cursor=a%7Cb",
    );
  });
});
