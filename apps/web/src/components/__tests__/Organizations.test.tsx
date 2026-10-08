import { organizationKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationDetail } from "@/components/OrganizationDetail";
import {
  OrganizationReview as OrganizationModerationDetail,
  OrganizationModeration as OrganizationModerationList,
} from "@/components/OrganizationModeration";
import { Organizations } from "@/components/Organizations";
import { renderWithI18n } from "@/test-utils";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getToken: vi.fn(async () => "token"),
  optimistic: vi.fn(),
  failed: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.push }),
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "viewer",
    getToken: mocks.getToken,
    feedback: { onOptimisticUpdate: mocks.optimistic, onError: mocks.failed },
  }),
}));
const options = { apiUrl: "https://api.test", userId: "viewer", getToken: mocks.getToken };
const location = {
  id: "location",
  name: "Club",
  address: "Via Roma 1, Roma, Italia",
  latitude: 41,
  longitude: 12,
};
const row = {
  id: "org",
  name: "Board Club",
  logoAssetId: "logo",
  location,
  approved: { name: "Board Club", logoAssetId: "logo", location },
  role: "none",
  version: 1,
  memberCount: 2,
  createdAt: "2026-10-01T00:00:00.000Z",
};
function render(
  ui: React.ReactElement,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return {
    client,
    ...renderWithI18n(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("organization screens", () => {
  it("pages organizations without duplicating main navigation heading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("cursor=next")
                ? { items: [{ ...row, id: "next-org", name: "Other Club" }], nextCursor: null }
                : { items: [row], nextCursor: "next" },
            ),
          ),
      ),
    );
    render(<Organizations />);
    await screen.findByText("Board Club");
    expect(screen.queryByRole("heading", { name: "Organizations" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Other Club");
    expect(
      screen.getByRole("link", { name: "Open organization: Board Club" }).getAttribute("href"),
    ).toBe("/organizations/org");
  });
  it("debounces public discovery and refuses undersized search", async () => {
    const fetch = vi.fn(async () => new Response('{"items":[],"nextCursor":null}'));
    vi.stubGlobal("fetch", fetch);
    render(<Organizations scope="public" />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Search organizations" }), {
      target: { value: "abc" },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Search organizations" }), {
      target: { value: "club" },
    });
    await screen.findByText("No organizations found");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("never fetches private members for outsiders and submits own membership request", async () => {
    let requested = false;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        requested = true;
        return new Response('{"id":"membership"}');
      }
      return new Response(JSON.stringify(requested ? { ...row, role: "requested" } : row));
    });
    vi.stubGlobal("fetch", fetch);
    render(<OrganizationDetail organizationId="org" />);
    await screen.findByText("Board Club");
    expect(
      screen.getByText("Organization members are visible only to confirmed members."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Request membership" }));
    await screen.findByRole("button", { name: "Cancel request" });
    expect(fetch.mock.calls.some(([url]) => url.includes("/members?"))).toBe(false);
  });
  it("requires confirmation before leaving and preserves cached content on recoverable failure", async () => {
    const member = {
      userId: "viewer",
      username: "player",
      avatarUrl: null,
      isAdmin: false,
      membership: { status: "ACCEPTED", kind: "REQUEST" },
    };
    const fetch = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Response('{"error":"CONFLICT"}', { status: 409 })
        : new Response(
            JSON.stringify(
              url.includes("/members")
                ? { items: [member], nextCursor: null }
                : { ...row, role: "accepted" },
            ),
          ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<OrganizationDetail organizationId="org" />);
    await screen.findByText("player");
    fireEvent.click(screen.getByRole("button", { name: "Leave organization" }));
    const dialog = screen.getByRole("dialog", { name: "Leave organization" });
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave organization" }));
    await waitFor(() =>
      expect(mocks.failed).toHaveBeenCalledWith(expect.any(Error), "leave_organization"),
    );
    await screen.findByText("player");
  });
  it("hides cached private membership when server revokes access", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(organizationKeys.detail(options, "org"), { ...row, role: "accepted" });
    client.setQueryData(organizationKeys.members(options, "org", "accepted", ""), {
      pages: [
        {
          items: [
            {
              userId: "private-person",
              username: "private-name",
              isAdmin: false,
              membership: { status: "ACCEPTED" },
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [""],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"ORGANIZATION_EXCLUDED"}', { status: 403 })),
    );
    render(<OrganizationDetail organizationId="org" />, client);
    await act(() => client.invalidateQueries({ queryKey: organizationKeys.root(options) }));
    await screen.findByText("Could not load organization");
    expect(screen.queryByText("private-name")).toBeNull();
  });
  it("preserves authoritative moderation version and requires rejection reason", async () => {
    let reviewed = false;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") reviewed = true;
      return new Response(
        JSON.stringify({
          ...row,
          name: "Secret proposal",
          proposal: { ...row.approved, name: "Secret proposal" },
          reviewStatus: reviewed ? "REJECTED" : "PENDING",
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    render(<OrganizationModerationDetail organizationId="org" />);
    await screen.findByText("Secret proposal");
    const reject = screen.getByRole("button", { name: "Reject organization" });
    expect(reject.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Rejection reason" }), {
      target: { value: "Provide a verified address" },
    });
    fireEvent.click(reject);
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([, init]) =>
            init?.body ===
            '{"decision":"reject","version":1,"reason":"Provide a verified address"}',
        ),
      ).toBe(true),
    );
    await screen.findByText("This proposal has already been reviewed.");
  });
  it("reports moderation access errors without exposing proposals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"MODERATOR_REQUIRED"}', { status: 403 })),
    );
    render(<OrganizationModerationList />);
    await screen.findByText("Moderator access required");
    expect(screen.queryByText("Secret proposal")).toBeNull();
  });
});
