import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventGroupSelect } from "../EventGroupSelect";

const options = vi.hoisted(() => ({ getToken: vi.fn(async () => "fresh") }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: options.getToken,
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function mount(locked = false) {
  const change = vi.fn();
  renderWithI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EventGroupSelect
        groupId={locked ? groupRecord.id : null}
        group={locked ? groupRecord : undefined}
        locked={locked}
        busy={false}
        onChange={change}
      />
    </QueryClientProvider>,
  );
  return change;
}
it("uses a searchable Select with group artwork, explicit no-group and demand-only source pages", async () => {
  const second = {
    ...groupRecord,
    id: "22222222-2222-4222-8222-222222222222",
    name: "Second group",
  };
  const fetch = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams;
    return new Response(
      JSON.stringify({
        items:
          params.has("cursor") || params.has("query")
            ? [second]
            : [groupRecord, { ...second, name: "Unapproved group", canInvite: false }],
        nextCursor: params.has("cursor") || params.has("query") ? null : "next",
      }),
    );
  });
  vi.stubGlobal("fetch", fetch);
  const change = mount();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Group$/ }));
  const list = await screen.findByRole("listbox");
  await within(list).findByRole("option", { name: /Friday group/ });
  expect(
    within(list)
      .getByRole("option", { name: /Friday group/ })
      .querySelector('[data-slot="animated-dicebear-artwork"], svg, img'),
  ).not.toBeNull();
  expect(within(list).queryByRole("option", { name: /Unapproved group/ })).toBeNull();
  expect(within(list).getByRole("option", { name: "No group" })).not.toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  Object.defineProperties(list, {
    scrollHeight: { value: 800 },
    clientHeight: { value: 200 },
    scrollTop: { value: 0, writable: true },
  });
  fireEvent.scroll(list);
  expect(fetch).toHaveBeenCalledTimes(1);
  list.scrollTop = 650;
  fireEvent.scroll(list);
  await within(list).findByRole("option", { name: /Second group/ });
  fireEvent.change(screen.getByRole("searchbox", { name: "Search groups" }), {
    target: { value: "seco" },
  });
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => new URL(url).searchParams.get("query") === "seco"),
    ).toBe(true),
  );
  expect(options.getToken).toHaveBeenCalledTimes(3);
  fireEvent.click(await screen.findByRole("option", { name: /Second group/ }));
  expect(change).toHaveBeenCalledWith(second.id);
  expect(screen.queryByRole("listbox")).toBeNull();
});
it("keeps request failures observable, supports retry and still offers explicit no-group", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      fail
        ? new Response('{"error":"FAILED"}', { status: 503 })
        : new Response('{"items":[],"nextCursor":null}'),
    ),
  );
  const change = mount();
  fireEvent.click(screen.getByRole("button", { name: /Group$/ }));
  await screen.findByText("Could not load groups");
  expect(screen.queryByText("No groups found")).toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No groups found");
  fireEvent.click(screen.getByRole("option", { name: "No group" }));
  expect(change).not.toHaveBeenCalled();
});
it("keeps contextual Group selection disabled without loading other groups", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const change = mount(true);
  const trigger = screen.getByRole("button", { name: "Friday group Group" });
  expect(trigger.hasAttribute("disabled")).toBe(true);
  fireEvent.click(trigger);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(change).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
