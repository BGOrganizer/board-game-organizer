import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useListActivity } from "@/lib/listActivity";
import { RetainedTabPanel } from "../RetainedTabPanel";

let client: QueryClient;
let mounted: Awaited<ReturnType<typeof render>> | undefined;
let canPage: (() => boolean) | undefined;
const initialized = vi.fn();
const connected = vi.fn();
const disconnected = vi.fn();
const read = vi.fn(async ({ queryKey }: { queryKey: readonly unknown[] }) => String(queryKey[1]));
function Probe({ owner }: { owner: string }) {
  const [count, setCount] = useState(() => {
    initialized();
    return 0;
  });
  const query = useQuery({
    queryKey: ["retention", owner],
    queryFn: read,
    staleTime: Infinity,
  });
  canPage = useListActivity();
  useEffect(() => {
    connected();
    return () => {
      disconnected();
    };
  }, []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Increment ${owner}`}
      onPress={() => setCount((value) => value + 1)}
    >
      <Text>{`${owner}:${query.data}:${count}`}</Text>
    </Pressable>
  );
}
function Fixture({
  active,
  owner = "owner-a",
  allowed = true,
}: {
  active: boolean;
  owner?: string;
  allowed?: boolean;
}) {
  return (
    <QueryClientProvider client={client}>
      {allowed ? (
        <RetainedTabPanel key={owner} active={active}>
          <Probe owner={owner} />
        </RetainedTabPanel>
      ) : null}
    </QueryClientProvider>
  );
}
async function show(active: boolean, owner = "owner-a", allowed = true) {
  const element = <Fixture active={active} owner={owner} allowed={allowed} />;
  if (mounted) await mounted.rerender(element);
  else mounted = await render(element);
}
function observers(owner: string) {
  return (
    client
      .getQueryCache()
      .find({ queryKey: ["retention", owner], exact: true })
      ?.getObserversCount() ?? 0
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  read.mockImplementation(async ({ queryKey }) => String(queryKey[1]));
  canPage = undefined;
  mounted = undefined;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});
afterEach(async () => {
  await cleanup();
  await client.cancelQueries();
  client.clear();
});

// Real React Activity, app activity context, TanStack observers and native hosts.
// Native host visibility/identity is not device frame-timing or physical hit-testing evidence.
it("does not mount an unvisited panel and disconnects its real effects/query observer while preserving native state", async () => {
  await show(false);
  expect(initialized).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { includeHiddenElements: true })).toBeNull();
  await show(true);
  expect(await screen.findByText("owner-a:owner-a:0")).toBeVisible();
  const button = screen.getByRole("button", { name: "Increment owner-a" });
  await userEvent.setup().press(button);
  expect(screen.getByText("owner-a:owner-a:1")).toBeVisible();
  const oldGate = canPage;
  if (!oldGate) throw new Error("Expected the real retained panel activity callback");
  expect(oldGate()).toBe(true);
  await show(false);
  expect(button).not.toBeVisible();
  expect(screen.queryByRole("button", { name: "Increment owner-a" })).toBeNull();
  expect(oldGate()).toBe(false);
  await waitFor(() => {
    expect(disconnected).toHaveBeenCalledOnce();
    expect(observers("owner-a")).toBe(0);
  });
  expect(client.getQueryData(["retention", "owner-a"])).toBe("owner-a");
  await act(() => client.setQueryData(["retention", "owner-a"], "fresh-cache"));
  await show(true);
  expect(await screen.findByText("owner-a:fresh-cache:1")).toBeVisible();
  expect(screen.getByRole("button", { name: "Increment owner-a" })).toBe(button);
  expect(initialized).toHaveBeenCalledOnce();
  expect(connected).toHaveBeenCalledTimes(2);
  expect(read).toHaveBeenCalledOnce();
  expect(oldGate()).toBe(true);
  expect(observers("owner-a")).toBe(1);
  read.mockResolvedValueOnce("server-refresh");
  await act(async () => {
    await client.refetchQueries({
      queryKey: ["retention", "owner-a"],
      exact: true,
    });
  });
  expect(await screen.findByText("owner-a:server-refresh:1")).toBeVisible();
  expect(screen.getByRole("button", { name: "Increment owner-a" })).toBe(button);
  expect(initialized).toHaveBeenCalledOnce();
  expect(read).toHaveBeenCalledTimes(2);
});

it("evicts native state and stale activity gates for a changed owner or revoked panel permission", async () => {
  await show(true);
  await screen.findByText("owner-a:owner-a:0");
  const first = screen.getByRole("button", { name: "Increment owner-a" });
  await userEvent.setup().press(first);
  expect(screen.getByText("owner-a:owner-a:1")).toBeVisible();
  const oldOwnerGate = canPage;
  await show(false, "owner-b");
  expect(screen.queryByRole("button", { includeHiddenElements: true })).toBeNull();
  expect(first).not.toBeOnTheScreen();
  expect(oldOwnerGate?.()).toBe(false);
  await waitFor(() => expect(observers("owner-a")).toBe(0));
  await show(true, "owner-b");
  expect(await screen.findByText("owner-b:owner-b:0")).toBeVisible();
  const second = screen.getByRole("button", { name: "Increment owner-b" });
  expect(second).not.toBe(first);
  await userEvent.setup().press(second);
  expect(screen.getByText("owner-b:owner-b:1")).toBeVisible();
  const revokedGate = canPage;
  await show(true, "owner-b", false);
  expect(screen.queryByRole("button", { includeHiddenElements: true })).toBeNull();
  expect(revokedGate?.()).toBe(false);
  await waitFor(() => expect(observers("owner-b")).toBe(0));
  expect(client.getQueryData(["retention", "owner-b"])).toBe("owner-b");
  await show(true, "owner-b");
  expect(await screen.findByText("owner-b:owner-b:0")).toBeVisible();
  expect(screen.getByRole("button", { name: "Increment owner-b" })).not.toBe(second);
  expect(initialized).toHaveBeenCalledTimes(3);
  expect(connected).toHaveBeenCalledTimes(3);
  expect(disconnected).toHaveBeenCalledTimes(2);
  expect(read).toHaveBeenCalledTimes(2);
});

it("leaves an ordinary real native list active when no retained panel supplies an activity owner", async () => {
  mounted = await render(
    <QueryClientProvider client={client}>
      <Probe owner="ordinary" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("ordinary:ordinary:0")).toBeVisible();
  expect(canPage?.()).toBe(true);
  expect(observers("ordinary")).toBe(1);
  expect(initialized).toHaveBeenCalledOnce();
  expect(connected).toHaveBeenCalledOnce();
});
