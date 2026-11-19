import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { FlatList } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import {
  FormInteractionScope,
  useFormInteraction,
} from "@/components/common/ui/FormInteractionScope";
import type { InputScrollTarget } from "@/lib/inputScrollContext";
import { useValidationList } from "../useValidationList";

type Props = Parameters<typeof useValidationList>[0];
type Handle = Pick<FlatList<unknown>, "scrollToIndex" | "scrollToOffset">;

// Actual React hooks and the actual form's cancellation/reveal tickets run in
// RNTL. Only native frame delivery, field measurement and the list's imperative
// platform handle are controlled. This is a hook/scope integration, not a claim
// about VirtualizedList viewability, keyboard frames or device scroll timing.
async function fixture(initial: Props, withScope = true) {
  const frames: Parameters<typeof requestAnimationFrame>[0][] = [];
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const network = vi.fn(async () => {
    throw new Error("Validation must not fetch data");
  });
  vi.stubGlobal("fetch", network);
  const list: Handle = { scrollToIndex: vi.fn(), scrollToOffset: vi.fn() };
  const reveal = vi.fn();
  const target: InputScrollTarget = { measureInWindow: (callback) => callback(0, 100, 200, 44) };
  const view = await renderHook(
    (props: Props) => {
      const form = useFormInteraction();
      const handlers = useValidationList(props);
      handlers.ref(list);
      return { handlers, form };
    },
    {
      initialProps: initial,
      wrapper: ({ children }: { children: ReactNode }) =>
        withScope ? <FormInteractionScope>{children}</FormInteractionScope> : children,
    },
  );
  const form = view.result.current.form;
  form?.register({ target: () => target, invalid: () => true, reveal });
  const flush = async () => {
    await act(async () => {
      while (frames.length) {
        frames.shift()?.(0);
        await Promise.resolve();
      }
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  return { ...view, list, reveal, network, form, flush };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("scrolls to an unmounted invalid row before revealing the real registered form field without fetching data", async () => {
  const f = await fixture({ scope: "api/user/step", attempt: 1, index: 40 });
  expect(f.list.scrollToIndex).toHaveBeenCalledExactlyOnceWith({
    index: 40,
    viewPosition: 0,
    animated: false,
  });
  expect(f.reveal).not.toHaveBeenCalled();
  await act(() =>
    f.result.current.handlers.onViewableItemsChanged({ viewableItems: [{ index: 39 }] }),
  );
  await f.flush();
  expect(f.reveal).not.toHaveBeenCalled();
  await act(() =>
    f.result.current.handlers.onViewableItemsChanged({
      viewableItems: [{ index: 40 }, { index: null }],
    }),
  );
  await f.flush();
  expect(f.reveal).toHaveBeenCalledOnce();
  expect(f.network).not.toHaveBeenCalled();
});

it("reveals already mounted rows and non-row selectors once per distinct submission attempt", async () => {
  const f = await fixture({ scope: "a", attempt: 0 });
  await act(() =>
    f.result.current.handlers.onViewableItemsChanged({ viewableItems: [{ index: 8 }] }),
  );
  await f.rerender({ scope: "a", attempt: 1, index: 8 });
  await f.flush();
  expect(f.reveal).toHaveBeenCalledOnce();
  await f.rerender({ scope: "a", attempt: 1, index: 8 });
  await f.flush();
  expect(f.reveal).toHaveBeenCalledOnce();
  await f.rerender({ scope: "a", attempt: 2 });
  await f.flush();
  expect(f.reveal).toHaveBeenCalledTimes(2);
  expect(f.list.scrollToIndex).toHaveBeenCalledExactlyOnceWith({
    index: 8,
    viewPosition: 0,
    animated: false,
  });
  expect(f.network).not.toHaveBeenCalled();
});

it.each(["scope", "inactive", "unmount", "touch"] as const)(
  "rejects captured viewability and native retry callbacks after %s",
  async (change) => {
    const f = await fixture({ scope: "a", attempt: 1, index: 50 });
    const old = f.result.current.handlers;
    await act(() => old.onScrollToIndexFailed({ averageItemLength: 60, index: 50 }));
    expect(f.list.scrollToOffset).toHaveBeenCalledExactlyOnceWith({
      offset: 3000,
      animated: false,
    });
    vi.mocked(f.list.scrollToIndex).mockClear();
    if (change === "scope") await f.rerender({ scope: "b", attempt: 1, index: 50 });
    if (change === "inactive")
      await f.rerender({ scope: "a", attempt: 1, index: 50, active: false });
    if (change === "unmount") await f.unmount();
    if (change === "touch") await act(() => f.form?.cancelErrorFocus());
    await act(() => old.onViewableItemsChanged({ viewableItems: [{ index: 50 }] }));
    await f.flush();
    expect(f.reveal).not.toHaveBeenCalled();
    expect(f.list.scrollToIndex).not.toHaveBeenCalled();
    expect(f.network).not.toHaveBeenCalled();
  },
);

it("bounds native retries to five and rejects a failure for a different row", async () => {
  const f = await fixture({ scope: "a", attempt: 1, index: 50 });
  await act(() =>
    f.result.current.handlers.onScrollToIndexFailed({ averageItemLength: 60, index: 49 }),
  );
  expect(f.list.scrollToOffset).not.toHaveBeenCalled();
  for (let attempt = 0; attempt < 8; attempt++) {
    await act(() =>
      f.result.current.handlers.onScrollToIndexFailed({ averageItemLength: 60, index: 50 }),
    );
    await f.flush();
  }
  expect(f.list.scrollToIndex).toHaveBeenCalledTimes(6);
  expect(
    vi
      .mocked(f.list.scrollToIndex)
      .mock.calls.every(
        ([args]) => args.index === 50 && args.viewPosition === 0 && args.animated === false,
      ),
  ).toBe(true);
  expect(f.list.scrollToOffset).toHaveBeenCalledTimes(8);
  expect(f.network).not.toHaveBeenCalled();
});

it("does not attempt platform scrolling or error reveal without a real form scope", async () => {
  const f = await fixture({ scope: "unowned", attempt: 1, index: 20 }, false);
  expect(f.form).toBeNull();
  await act(() =>
    f.result.current.handlers.onScrollToIndexFailed({ averageItemLength: 60, index: 20 }),
  );
  await act(() =>
    f.result.current.handlers.onViewableItemsChanged({ viewableItems: [{ index: 20 }] }),
  );
  await f.flush();
  expect(f.list.scrollToIndex).not.toHaveBeenCalled();
  expect(f.list.scrollToOffset).not.toHaveBeenCalled();
  expect(f.reveal).not.toHaveBeenCalled();
  expect(f.network).not.toHaveBeenCalled();
});

it("waits for a current real form ticket again after inactive reentry with a new submission attempt", async () => {
  const f = await fixture({ scope: "a", attempt: 1, index: 5, active: false });
  expect(f.list.scrollToIndex).not.toHaveBeenCalled();
  await f.rerender({ scope: "a", attempt: 2, index: 5, active: true });
  expect(f.list.scrollToIndex).toHaveBeenCalledExactlyOnceWith({
    index: 5,
    viewPosition: 0,
    animated: false,
  });
  await act(() =>
    f.result.current.handlers.onViewableItemsChanged({ viewableItems: [{ index: 5 }] }),
  );
  await f.flush();
  expect(f.reveal).toHaveBeenCalledOnce();
});
