import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupWizard } from "../GroupWizard";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it.each([false, true])(
  "returns to the list after creation, retains detail return after edit=%s",
  async (edit) => {
    const fetcher = vi.fn(
      async (url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            url.includes("/favorites")
              ? { items: [], nextCursor: null }
              : { ...groupRecord, version: init?.method === "PATCH" ? 2 : 1 },
          ),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    renderWithI18n(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <GroupWizard groupId={edit ? groupRecord.id : undefined} />
      </QueryClientProvider>,
    );
    fireEvent.change(await screen.findByRole("textbox", { name: "Group name" }), {
      target: { value: "Friday group" },
    });
    fireEvent.click(screen.getByRole("button", { name: edit ? "Save changes" : "Create group" }));
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        edit ? `/groups/${groupRecord.id}` : "/groups",
      ),
    );
    const writes = fetcher.mock.calls.filter(
      ([, init]) => init?.method === (edit ? "PATCH" : "POST"),
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject(
      edit
        ? { version: 1, name: "Friday group" }
        : { type: "PRIVATE", name: "Friday group", invitedUserIds: [] },
    );
  },
);
