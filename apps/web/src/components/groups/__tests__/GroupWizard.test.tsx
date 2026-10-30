import {
  clearSessionQueryCache,
  groupRecordDetailQuery,
  groupRecordKeys,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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

it.each([409, 503])(
  "retains a rejected Group edit outside Query pages, closes before HTTP and prevents unknown-outcome retries: %s",
  async (status) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let release: ((response: Response) => void) | undefined;
    let canonical = groupRecord;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH")
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return Response.json(
        url.includes("/favorites") ? { items: [], nextCursor: null } : canonical,
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const mount = () =>
      renderWithI18n(
        <QueryClientProvider client={client}>
          <GroupWizard groupId={groupRecord.id} />
        </QueryClientProvider>,
      );
    const form = mount();
    fireEvent.change(await screen.findByRole("textbox", { name: "Group name" }), {
      target: { value: "Retained group edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(navigation.replace).toHaveBeenCalledWith(`/groups/${groupRecord.id}`);
    await waitFor(() => expect(release).toBeDefined());
    const key = groupRecordKeys.detail(
      { apiUrl: "https://api.test", userId: "owner" },
      groupRecord.id,
    );
    expect(client.getQueryData(key)).toMatchObject({
      name: "Retained group edit",
      version: groupRecord.version,
    });
    form.unmount();
    const respond = release;
    if (!respond) throw new Error("Missing Group edit response");
    await act(async () =>
      respond(Response.json({ error: status === 409 ? "GROUP_CHANGED" : "UNKNOWN" }, { status })),
    );
    await waitFor(() =>
      expect(
        client
          .getMutationCache()
          .getAll()
          .some((mutation) => mutation.state.status === "error"),
      ).toBe(true),
    );
    const restored = mount();
    expect(
      ((await screen.findByRole("textbox", { name: "Group name" })) as HTMLInputElement).value,
    ).toBe("Retained group edit");
    expect(client.getQueryData(key)).toMatchObject({ name: groupRecord.name });
    expect(
      (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
    ).toBe(status === 503);
    if (status === 503) expect(screen.getByText("Checking saved changes")).toBeTruthy();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    if (status === 503) {
      canonical = { ...groupRecord, name: "Verified canonical club", version: 2 };
      await act(async () =>
        client.fetchQuery({
          ...groupRecordDetailQuery(
            { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" },
            groupRecord.id,
          ),
          staleTime: 0,
        }),
      );
      await screen.findByText("This group changed. Go back and reopen the editor before saving.");
      expect(
        (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      restored.unmount();
      const current = mount();
      expect(
        ((await screen.findByRole("textbox", { name: "Group name" })) as HTMLInputElement).value,
      ).toBe(canonical.name);
      expect(
        (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
      current.unmount();
    } else restored.unmount();
    clearSessionQueryCache(client);
  },
);
