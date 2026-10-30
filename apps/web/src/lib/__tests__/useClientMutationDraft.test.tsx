import { CommunityApiError, useClientMutationDraft } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it } from "vitest";

it("reads only the current exact actor/API/resource key, including the first render after a filter change", async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const key = (api: string, owner: string) => ["groups", api, owner, "mutation", "group", "update"];
  const a = key("api-a", "alice"),
    b = key("api-b", "bob");
  for (const [mutationKey, name] of [
    [a, "Alice private draft"],
    [b, "Bob private draft"],
  ] as const) {
    await client
      .getMutationCache()
      .build(client, {
        mutationKey,
        mutationFn: async (_input: { name: string }) => {
          throw new CommunityApiError(409, "GROUP_CHANGED");
        },
      })
      .execute({ name })
      .catch(() => undefined);
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ mutationKey }) => useClientMutationDraft<{ name: string }>(mutationKey),
    { wrapper, initialProps: { mutationKey: a } },
  );
  expect(hook.result.current).toMatchObject({
    phase: "failed",
    variables: { name: "Alice private draft" },
  });
  hook.rerender({ mutationKey: b });
  expect(hook.result.current).toMatchObject({
    phase: "failed",
    variables: { name: "Bob private draft" },
  });
  hook.rerender({ mutationKey: key("api-b", "charlie") });
  expect(hook.result.current).toBeUndefined();
  hook.unmount();
  client.clear();
});

it.each([409, 503])(
  "uses a newer canonical epoch as a fence, never a fabricated receipt or structural write retry: %s",
  async (status) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const mutationKey = ["events", "api", "owner", "mutation", "event", "update"];
    const input = { version: 1, tables: [{ name: "New physical table" }] };
    let calls = 0;
    const mutation = client.getMutationCache().build(client, {
      mutationKey,
      mutationFn: async (_input: typeof input) => {
        calls++;
        throw new CommunityApiError(status, "FAILED");
      },
    });
    await mutation.execute(input).catch(() => undefined);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      ({ epoch }) => useClientMutationDraft<typeof input>(mutationKey, epoch),
      { wrapper, initialProps: { epoch: 1 } },
    );
    expect(hook.result.current?.variables).toEqual(input);
    hook.rerender({ epoch: 2 });
    if (status === 503) expect(hook.result.current).toBeUndefined();
    else expect(hook.result.current?.phase).toBe("failed");
    expect(calls).toBe(1);
    expect(mutation.state.status).toBe("error");
    expect(mutation.state.variables).toEqual(input);
    hook.unmount();
    client.clear();
  },
);
it("preserves uncertain input without retrying it, then lets the latest successful replacement suppress older failed drafts", async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const mutationKey = ["events", "api", "owner", "mutation", "event", "finalize"];
  let attempts = 0;
  await client
    .getMutationCache()
    .build(client, {
      mutationKey,
      mutationFn: async (_input: { score: string }) => {
        attempts++;
        throw new CommunityApiError(503, "UNKNOWN");
      },
    })
    .execute({ score: "-0.00100" })
    .catch(() => undefined);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useClientMutationDraft<{ score: string }>(mutationKey), {
    wrapper,
  });
  expect(hook.result.current).toMatchObject({
    phase: "verifying",
    variables: { score: "-0.00100" },
  });
  expect(attempts).toBe(1);
  await act(async () => {
    await client
      .getMutationCache()
      .build(client, { mutationKey, mutationFn: async (_input: { score: string }) => null })
      .execute({ score: "0.0001" });
  });
  expect(client.getMutationCache().getAll()).toHaveLength(2);
  await waitFor(() => expect(hook.result.current).toBeUndefined());
  hook.unmount();
  client.clear();
});
