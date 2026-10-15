import type { OrganizationResponse } from "@board-game-organizer/schemas";
import { useOrganizationPeople } from "@board-game-organizer/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const paging = vi.hoisted(() => ({
  pages: {} as Record<string, ReturnType<typeof page>>,
  calls: vi.fn(),
}));
function page(userId: string) {
  return {
    items: [{ userId }],
    isSuccess: true,
    isPending: false,
    isError: false,
    error: null as Error | null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}
vi.mock(
  "../../../../../../packages/shared/src/organizations/hooks/useOrganizations",
  async (original) => ({
    ...(await original<typeof import("@board-game-organizer/shared")>()),
    useOrganizationMembers: (options: unknown, id: string, mode = "accepted") => {
      paging.calls(options, id, mode);
      return paging.pages[mode];
    },
  }),
);
const options = { apiUrl: "https://api.test", userId: "viewer", getToken: async () => "fresh" };
const organization = { id: "org", role: "admin" } as OrganizationResponse;
beforeEach(() => {
  vi.clearAllMocks();
  paging.pages = { accepted: page("admin"), pending: page("request"), excluded: page("excluded") };
});

describe("ordered organization member paging", () => {
  it("does not expose or load later sources before accepted and pending pages finish", () => {
    paging.pages.accepted.hasNextPage = true;
    const hook = renderHook(() => useOrganizationPeople(options, organization));
    expect(hook.result.current.items.map((row) => row.userId)).toEqual(["admin"]);
    expect(paging.calls.mock.calls.at(-2)?.[0].enabled).toBe(false);
    expect(paging.calls.mock.calls.at(-1)?.[0].enabled).toBe(false);
    hook.result.current.fetchNextPage();
    expect(paging.pages.accepted.fetchNextPage).toHaveBeenCalledOnce();
    paging.pages.accepted.hasNextPage = false;
    paging.pages.pending.hasNextPage = true;
    hook.rerender();
    expect(hook.result.current.items.map((row) => row.userId)).toEqual(["admin", "request"]);
    hook.result.current.fetchNextPage();
    expect(paging.pages.pending.fetchNextPage).toHaveBeenCalledOnce();
    paging.pages.pending.hasNextPage = false;
    paging.pages.excluded.hasNextPage = true;
    hook.rerender();
    expect(hook.result.current.items.map((row) => row.userId)).toEqual([
      "admin",
      "request",
      "excluded",
    ]);
    hook.result.current.fetchNextPage();
    expect(paging.pages.excluded.fetchNextPage).toHaveBeenCalledOnce();
    hook.result.current.refetch();
    for (const p of Object.values(paging.pages)) expect(p.refetch).toHaveBeenCalledOnce();
  });
  it("never exposes cached pending/excluded rows to nonadministrators", () => {
    const hook = renderHook(() =>
      useOrganizationPeople(options, { ...organization, role: "accepted" }),
    );
    expect(hook.result.current.items.map((row) => row.userId)).toEqual(["admin"]);
    expect(hook.result.current.hasNextPage).toBe(false);
    expect(hook.result.current.fetchNextPage()).toBeUndefined();
    hook.result.current.refetch();
    expect(paging.pages.pending.refetch).not.toHaveBeenCalled();
    expect(paging.pages.excluded.refetch).not.toHaveBeenCalled();
  });
  it("preserves errors, loading and failed-next-page state without enabling private sources", () => {
    Object.assign(paging.pages.accepted, {
      isSuccess: false,
      isPending: true,
      isFetchingNextPage: true,
      isFetchNextPageError: true,
    });
    const hook = renderHook(() =>
      useOrganizationPeople({ ...options, enabled: false }, organization),
    );
    expect(hook.result.current).toMatchObject({
      isPending: true,
      isError: false,
      isFetchingNextPage: true,
      isFetchNextPageError: true,
      error: undefined,
    });
    Object.assign(paging.pages.accepted, {
      isPending: false,
      isError: true,
      error: new Error("403"),
    });
    hook.rerender();
    expect(hook.result.current.isError).toBe(true);
    expect(hook.result.current.error?.message).toBe("403");
    expect(paging.calls.mock.calls.at(-1)?.[0].enabled).toBe(false);
  });
});
