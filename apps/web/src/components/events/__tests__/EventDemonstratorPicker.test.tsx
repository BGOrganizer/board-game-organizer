import { CommunityApiError } from "@board-game-organizer/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventDemonstratorPicker } from "../EventDemonstratorPicker";

const hooks = vi.hoisted(() => ({ members: vi.fn(), sentinel: vi.fn() }));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useOrganizationMembers: (...args: unknown[]) => hooks.members(...args),
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({ apiUrl: "https://api.test", userId: "owner", getToken: vi.fn() }),
}));
vi.mock("@/lib/useInfiniteScroll", () => ({
  useInfiniteScroll: (...args: unknown[]) => {
    hooks.sentinel(...args);
    return () => {};
  },
}));
const member = {
  userId: "demo",
  name: "Demo Name",
  username: "demo_nick",
  avatarUrl: null,
  isAdmin: false,
  membership: { status: "ACCEPTED" },
};
let state: {
  items: (typeof member)[];
  isPending: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
  fetchNextPage: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.clearAllMocks();
  state = {
    items: [member],
    isPending: false,
    isError: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    error: null,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  };
  hooks.members.mockImplementation(() => state);
});
it("selects confirmed members, searches after debounce and keeps Back inside header", async () => {
  const onSelect = vi.fn(),
    onClose = vi.fn();
  renderWithI18n(
    <EventDemonstratorPicker organizationId="org" onSelect={onSelect} onClose={onClose} />,
  );
  expect(hooks.members).toHaveBeenCalledWith(expect.any(Object), "org", "accepted", "");
  fireEvent.change(screen.getByRole("searchbox", { name: "Organization members" }), {
    target: { value: "demo" },
  });
  await waitFor(() =>
    expect(hooks.members).toHaveBeenLastCalledWith(expect.any(Object), "org", "accepted", "demo"),
  );
  fireEvent.click(screen.getByRole("button", { name: "demo_nick" }));
  expect(onSelect).toHaveBeenCalledWith(member);
  const back = screen.getByRole("button", { name: "Back" });
  expect(back.closest("header")).toBeTruthy();
  fireEvent.click(back);
  expect(onClose).toHaveBeenCalledOnce();
});
it("shows empty, error/retry and paginated states without hiding cached members on ordinary failure", () => {
  state.items = [];
  let view = renderWithI18n(
    <EventDemonstratorPicker organizationId="org" onSelect={vi.fn()} onClose={vi.fn()} />,
  );
  expect(screen.getByText("No members found")).toBeTruthy();
  view.unmount();
  state.items = [member];
  state.isError = true;
  state.error = new Error("network");
  state.hasNextPage = true;
  view = renderWithI18n(
    <EventDemonstratorPicker organizationId="org" onSelect={vi.fn()} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Demo Name")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(state.refetch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(state.fetchNextPage).toHaveBeenCalledOnce();
});
it("never exposes cached private members after access is denied", () => {
  state.isError = true;
  state.error = new CommunityApiError(403, "ORGANIZATION_MEMBER_REQUIRED");
  renderWithI18n(
    <EventDemonstratorPicker organizationId="org" onSelect={vi.fn()} onClose={vi.fn()} />,
  );
  expect(screen.queryByText("Demo Name")).toBeNull();
  expect(screen.getByRole("alert")).toBeTruthy();
});
it("blocks repeated pagination while loading", () => {
  state.isPending = true;
  state.hasNextPage = true;
  state.isFetchingNextPage = true;
  renderWithI18n(
    <EventDemonstratorPicker organizationId="org" onSelect={vi.fn()} onClose={vi.fn()} />,
  );
  const more = screen.getByRole("button", { name: "Load more" });
  expect(more.hasAttribute("disabled")).toBe(true);
  fireEvent.click(more);
  expect(state.fetchNextPage).not.toHaveBeenCalled();
});
