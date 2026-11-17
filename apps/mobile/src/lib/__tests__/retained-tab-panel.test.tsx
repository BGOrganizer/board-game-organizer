// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { useListActivity } from "../listActivity";

// Real React/Query lifecycle checks; DOM hosts do not establish native frame or layout timing.
// Keep these test-only host types local instead of adding browser globals to the native tsconfig.
type TestButton = { textContent: string | null; style: { display: string }; click(): void };
type TestHost = HTMLDivElement & {
  textContent: string | null;
  querySelector(selector: "button"): TestButton | null;
  remove(): void;
};
const testDocument = (
  globalThis as unknown as {
    document: { createElement(tag: "div"): TestHost; body: { append(host: TestHost): void } };
  }
).document;
let root: Root, host: TestHost, client: QueryClient;
let canPage: (() => boolean) | undefined;
const initialized = vi.fn(),
  connected = vi.fn(),
  disconnected = vi.fn();
const fetch = vi.fn(async ({ queryKey }: { queryKey: readonly unknown[] }) => String(queryKey[1]));
function Probe({ owner }: { owner: string }) {
  const [count, setCount] = useState(() => {
    initialized();
    return 0;
  });
  const query = useQuery({ queryKey: ["retention", owner], queryFn: fetch, staleTime: Infinity });
  canPage = useListActivity();
  useEffect(() => {
    connected();
    return () => {
      disconnected();
    };
  }, []);
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      {owner}:{query.data}:{count}
    </button>
  );
}
async function render(active: boolean, owner = "owner-a", allowed = true) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        {allowed ? (
          <RetainedTabPanel key={owner} active={active}>
            <Probe owner={owner} />
          </RetainedTabPanel>
        ) : null}
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  canPage = undefined;
  host = testDocument.createElement("div");
  testDocument.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});

it("does not mount an unvisited panel, and disconnects effects/queries while retaining visited state", async () => {
  await render(false);
  expect(initialized).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  await render(true);
  await render(true);
  const button = host.querySelector("button");
  if (!button) throw new Error("Expected the active panel button");
  expect(button.textContent).toBe("owner-a:owner-a:0");
  await act(async () => button.click());
  expect(button.textContent).toBe("owner-a:owner-a:1");
  const oldCallback = canPage;
  if (!oldCallback) throw new Error("Expected the activity gate");
  expect(oldCallback()).toBe(true);
  await render(false);
  expect(button.style.display).toBe("none");
  expect(oldCallback()).toBe(false);
  expect(disconnected).toHaveBeenCalledOnce();
  expect(
    client
      .getQueryCache()
      .find({ queryKey: ["retention", "owner-a"] })
      ?.getObserversCount(),
  ).toBe(0);
  expect(client.getQueryData(["retention", "owner-a"])).toBe("owner-a");
  client.setQueryData(["retention", "owner-a"], "fresh-cache");
  await render(true);
  await render(true);
  expect(host.querySelector("button")).toBe(button);
  expect(button.textContent).toBe("owner-a:fresh-cache:1");
  expect(initialized).toHaveBeenCalledOnce();
  expect(connected).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledOnce();
  expect(oldCallback()).toBe(true);
  fetch.mockResolvedValueOnce("server-refresh");
  await act(async () => {
    await client.refetchQueries({ queryKey: ["retention", "owner-a"], exact: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(button.textContent).toBe("owner-a:server-refresh:1");
  expect(host.querySelector("button")).toBe(button);
  expect(initialized).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("evicts state for a changed owner and for revoked panel access", async () => {
  await render(true);
  await render(true);
  await act(async () => {
    const button = host.querySelector("button");
    if (!button) throw new Error("Expected the active panel button");
    button.click();
  });
  await render(false, "owner-b");
  expect(host.querySelector("button")).toBeNull();
  await render(true, "owner-b");
  await render(true, "owner-b");
  expect(host.textContent).toBe("owner-b:owner-b:0");
  await render(true, "owner-b", false);
  expect(host.querySelector("button")).toBeNull();
  await render(true, "owner-b");
  await render(true, "owner-b");
  expect(initialized).toHaveBeenCalledTimes(3);
  expect(host.textContent).toBe("owner-b:owner-b:0");
});

it("leaves ordinary lists active when no retained panel owns them", async () => {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe owner="ordinary" />
      </QueryClientProvider>,
    ),
  );
  expect(canPage?.()).toBe(true);
});
