import {
  type CreateGroupRecordInput,
  createGroupRecordSchema,
  type GroupRecordResponse,
} from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  clearSessionQueryCache,
  groupRecordDetailQuery,
  groupRecordKeys,
  groupRecordsPageQuery,
  useGroupRecords,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupCard } from "../GroupCard";
import { GroupWizard } from "../GroupWizard";

const m = vi.hoisted(() => ({
  options: {} as CommunityApiOptions,
  replace: vi.fn(),
  back: vi.fn(),
  logo: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace, back: m.back }) }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => m.options }));
// Unit fixtures for already prepared assets/verified picks; these are not upload/geocoding acceptance.
vi.mock("../GroupLogoPicker", () => ({
  GroupLogoPicker: (props: { value: unknown; onChange: (value: object) => void }) => {
    m.logo(props);
    return (
      <button
        type="button"
        onClick={() =>
          props.onChange({
            id: "88888888-8888-4888-8888-888888888888",
            preview: "data:image/webp;base64,AAAA",
          })
        }
      >
        Use uploaded logo
      </button>
    );
  },
}));
vi.mock("@/components/locations/SearchLocationPage", () => ({
  SearchLocationPage: ({ onSelect }: { onSelect: (location: object) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: "33333333-3333-4333-8333-333333333333",
          name: "Club venue",
          address: "Via Roma 1",
          latitude: 41.9,
          longitude: 12.5,
          timeZone: "Europe/Rome",
        })
      }
    >
      Choose verified location
    </button>
  ),
}));
const realId = "77777777-7777-4777-8777-777777777777";
const clients: QueryClient[] = [];
function PreviewList({ scope = "mine" }: { scope?: "mine" | "public" }) {
  const list = useGroupRecords(m.options, scope, scope === "public" ? "Local" : "", ["admin"]);
  return (
    <>
      {list.items.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          checking={list.isFetching}
          onVerify={() => void list.refetch({ cancelRefetch: false })}
        />
      ))}
    </>
  );
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: vi.fn(async () => "fresh"),
    feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
  };
  m.options = options;
  const renderWizard = (draftId?: string) =>
    renderWithI18n(
      <QueryClientProvider client={client}>
        <GroupWizard draftId={draftId} />
      </QueryClientProvider>,
    );
  const list = renderWithI18n(
    <QueryClientProvider client={client}>
      <PreviewList />
    </QueryClientProvider>,
  );
  const discovery = renderWithI18n(
    <QueryClientProvider client={client}>
      <PreviewList scope="public" />
    </QueryClientProvider>,
  );
  return { client, options, list, discovery, renderWizard };
}
afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const client of clients.splice(0)) clearSessionQueryCache(client);
  });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("returns and shows a private draft before POST, never adds it to discovery, deduplicates a CID read and preserves a newer detail over an old reply", async () => {
  let saved: GroupRecordResponse | undefined;
  let snapshot!: GroupRecordResponse;
  let releasePost!: (response: Response) => void;
  let holdLists = false;
  let releaseList!: (response: Response) => void;
  let body!: CreateGroupRecordInput;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      body = createGroupRecordSchema.parse(JSON.parse(String(init.body)));
      saved = {
        ...groupRecord,
        id: realId,
        name: body.name,
        approved: { name: body.name },
        clientRequestId: body.clientRequestId,
      };
      snapshot = saved;
      return new Promise<Response>((resolve) => {
        releasePost = resolve;
      });
    }
    if (url.includes("/groups?")) {
      if (url.includes("scope=public")) return Response.json({ items: [], nextCursor: null });
      if (holdLists)
        return new Promise<Response>((resolve) => {
          releaseList = resolve;
        });
      return Response.json({ items: saved ? [saved] : [], nextCursor: null });
    }
    if (url.endsWith(`/groups/${realId}`)) return Response.json(saved);
    return Response.json({ items: [], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetch);
  const { client, options, list, discovery, renderWizard } = setup();
  const wizard = renderWizard();
  fireEvent.change(wizard.getByRole("textbox", { name: "Group name" }), {
    target: { value: "Local private group" },
  });
  fireEvent.click(wizard.getByRole("button", { name: "Create group" }));
  expect(m.replace).toHaveBeenCalledWith("/groups");
  await waitFor(() => expect(releasePost).toBeDefined());
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("create_group");
  const provisional = list.getByRole("link", { name: "Saving: Local private group" });
  expect(provisional.getAttribute("aria-disabled")).toBe("true");
  expect(provisional.getAttribute("href")).toBe("/groups");
  expect(discovery.container.querySelectorAll("a")).toHaveLength(0);
  const raw = JSON.parse(
    String(fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body),
  );
  expect(raw).toEqual(body);
  expect(raw).not.toHaveProperty("clientDraft");
  expect(raw).not.toHaveProperty("adminUserId");
  await act(async () => {
    await client.fetchInfiniteQuery({
      ...groupRecordsPageQuery(options, "mine", "", ["admin"]),
      staleTime: 0,
    });
  });
  await list.findByRole("link", { name: "Open group: Local private group" });
  expect(list.container.querySelectorAll("a")).toHaveLength(1);
  saved = { ...snapshot, name: "Updated group", approved: { name: "Updated group" }, version: 2 };
  await act(async () => {
    await client.fetchQuery(groupRecordDetailQuery(options, realId));
  });
  holdLists = true;
  await act(async () => releasePost(Response.json(snapshot)));
  await waitFor(() => expect(releaseList).toBeDefined());
  expect(client.getQueryData(groupRecordKeys.detail(options, realId))).toMatchObject({
    name: "Updated group",
    version: 2,
  });
  holdLists = false;
  await act(async () => releaseList(Response.json({ items: [saved], nextCursor: null })));
  await list.findByRole("link", { name: "Open group: Updated group" });
  expect(list.container.querySelectorAll("a")).toHaveLength(1);
  expect(discovery.container.querySelectorAll("a")).toHaveLength(0);
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(1);
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
  expect(options.feedback.onError).not.toHaveBeenCalled();
});

it("restores a definitively rejected public proposal including raw name, prepared logo and verified venue, without publishing or automatically retrying it", async () => {
  let release!: (response: Response) => void;
  const posts: CreateGroupRecordInput[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(createGroupRecordSchema.parse(JSON.parse(String(init.body))));
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  const { options, list, discovery, renderWizard } = setup();
  const wizard = renderWizard();
  fireEvent.change(wizard.getByRole("textbox", { name: "Group name" }), {
    target: { value: "  Local public proposal  " },
  });
  fireEvent.click(wizard.getByRole("switch", { name: "Public group" }));
  fireEvent.click(wizard.getByRole("button", { name: "Use uploaded logo" }));
  fireEvent.click(wizard.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(wizard.getByRole("button", { name: "Choose verified location" }));
  fireEvent.click(wizard.getByRole("button", { name: "Submit for review" }));
  expect(m.replace).toHaveBeenCalledWith("/groups");
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("submit_group_review");
  expect(list.getByRole("link", { name: "Saving: Local public proposal" })).toBeDefined();
  expect(discovery.container.querySelectorAll("a")).toHaveLength(0);
  await act(async () => release(Response.json({ error: "GROUP_NAME_TAKEN" }, { status: 409 })));
  const rejected = await list.findByRole("link", {
    name: "Not saved. Edit draft: Local public proposal",
  });
  const draftId = new URL(rejected.getAttribute("href") ?? "", "https://web.test").searchParams.get(
    "draftId",
  );
  expect(draftId).not.toBeNull();
  wizard.unmount();
  const recovered = renderWizard(draftId ?? undefined);
  expect((recovered.getByRole("textbox", { name: "Group name" }) as HTMLInputElement).value).toBe(
    "  Local public proposal  ",
  );
  expect(recovered.getByRole("button", { name: "Submit for review" })).toBeDefined();
  expect(recovered.getByText("Club venue")).toBeDefined();
  expect(m.logo.mock.calls.at(-1)?.[0].value).toEqual({
    id: "88888888-8888-4888-8888-888888888888",
    preview: "data:image/webp;base64,AAAA",
  });
  expect(posts).toHaveLength(1);
  expect(discovery.container.querySelectorAll("a")).toHaveLength(0);
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "submit_group_review");
});

it("verifies a late Group commit after an unknown response without resubmitting or exposing it through discovery", async () => {
  let saved: GroupRecordResponse | undefined;
  let body!: CreateGroupRecordInput;
  let release!: (response: Response) => void;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      body = createGroupRecordSchema.parse(JSON.parse(String(init.body)));
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }
    return Response.json({
      items: url.includes("/groups?") && !url.includes("scope=public") && saved ? [saved] : [],
      nextCursor: null,
    });
  });
  vi.stubGlobal("fetch", fetch);
  const { options, list, discovery, renderWizard } = setup();
  const wizard = renderWizard();
  fireEvent.change(wizard.getByRole("textbox", { name: "Group name" }), {
    target: { value: "Local unverified group" },
  });
  fireEvent.click(wizard.getByRole("button", { name: "Create group" }));
  expect(m.replace).toHaveBeenCalledWith("/groups");
  await waitFor(() => expect(release).toBeDefined());
  await act(async () => release(Response.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 503 })));
  const check = await list.findByRole("button", { name: "Check saved changes" });
  await waitFor(() => expect((check as HTMLButtonElement).disabled).toBe(false));
  expect(
    list
      .getByRole("link", { name: "Checking saved changes: Local unverified group" })
      .getAttribute("href"),
  ).toBe("/groups");
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "verify_saved_changes");
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  saved = {
    ...groupRecord,
    id: realId,
    name: body.name,
    approved: { name: body.name },
    clientRequestId: body.clientRequestId,
  };
  fireEvent.click(check);
  await list.findByRole("link", { name: "Open group: Local unverified group" });
  expect(list.container.querySelectorAll("a")).toHaveLength(1);
  expect(discovery.container.querySelectorAll("a")).toHaveLength(0);
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(1);
});
