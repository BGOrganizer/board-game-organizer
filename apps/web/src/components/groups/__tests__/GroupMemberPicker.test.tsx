import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupMemberPicker } from "../GroupMemberPicker";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test.invalid",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
const member = {
  userId: "user_member",
  name: "Accepted Player",
  avatarUrl: null,
  isAdmin: true,
  ban: null,
  membership: null,
};
function mount(props: Partial<Parameters<typeof GroupMemberPicker>[0]> = {}) {
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const build = (next: Partial<Parameters<typeof GroupMemberPicker>[0]>) => (
    <QueryClientProvider client={client}>
      <GroupMemberPicker groupId={groupRecord.id} onSelect={onSelect} {...next} />
    </QueryClientProvider>
  );
  const view = renderWithI18n(build(props));
  return {
    ...view,
    onSelect,
    rerender: (next: Partial<Parameters<typeof GroupMemberPicker>[0]>) =>
      view.rerender(build(next)),
  };
}
afterEach(() => vi.unstubAllGlobals());

it("keeps an accepted-roster failure observable and explicitly retries to an honest empty state", async () => {
  let denied = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      denied
        ? Response.json({ error: "FORBIDDEN" }, { status: 403 })
        : Response.json({ items: [], nextCursor: null }),
    ),
  );
  mount();
  expect(await screen.findByText("Could not load group members")).toBeTruthy();
  expect(screen.queryByText("No members found")).toBeNull();
  denied = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No members found")).toBeTruthy();
  expect(screen.queryByText("Could not load group members")).toBeNull();
});

it("excludes assigned people, retains an honest missing-name fallback and prevents disabled selection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        items: [member, { ...member, userId: "user_unnamed", name: null }],
        nextCursor: null,
      }),
    ),
  );
  const { onSelect, rerender } = mount({ excludeIds: [member.userId] });
  const choose = await screen.findByRole("button", { name: "Select user: user_unnamed" });
  expect(screen.queryByRole("button", { name: "Select user: Accepted Player" })).toBeNull();
  fireEvent.click(choose);
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({
    id: "user_unnamed",
    name: "user_unnamed",
    avatarUrl: null,
  });
  rerender({ excludeIds: [member.userId], disabled: true });
  expect((choose as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(choose);
  expect(onSelect).toHaveBeenCalledOnce();
});

it("sends a debounced accepted-member query and permits clearing it without widening the authorized group", async () => {
  const requests: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      requests.push(url);
      return Response.json({
        items: url.searchParams.get("query") === "Player" ? [member] : [],
        nextCursor: null,
      });
    }),
  );
  mount();
  await screen.findByText("No members found");
  const search = screen.getByRole("searchbox", { name: "Search members" });
  fireEvent.change(search, { target: { value: "Player" } });
  await screen.findByRole("button", { name: "Select user: Accepted Player" });
  expect(requests.at(-1)?.pathname).toBe(`/api/groups/${groupRecord.id}/members`);
  expect(requests.at(-1)?.searchParams.get("mode")).toBe("accepted");
  expect(requests.at(-1)?.searchParams.get("query")).toBe("Player");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  await screen.findByText("No members found");
  expect((search as HTMLInputElement).value).toBe("");
});

it("keeps existing members visible while explicitly fetching another accepted-member page", async () => {
  let complete: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) =>
      new URL(input).searchParams.get("cursor")
        ? new Promise<Response>((resolve) => {
            complete = resolve;
          })
        : Promise.resolve(Response.json({ items: [member], nextCursor: "more-members" })),
    ),
  );
  mount();
  await screen.findByRole("button", { name: "Select user: Accepted Player" });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(complete).toBeDefined());
  expect(screen.getByRole("button", { name: "Select user: Accepted Player" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "Load more" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(async () => {
    complete?.(
      Response.json({
        items: [{ ...member, userId: "user_second", name: "Second Player" }],
        nextCursor: null,
      }),
    );
  });
  expect(await screen.findByRole("button", { name: "Select user: Second Player" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Select user: Accepted Player" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});
