import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { useAppRestartGuard } from "@/lib/appRestartGuard";
import type { InputScrollTarget } from "@/lib/inputScrollContext";
import { FormInteractionScope, useFormInteraction } from "../FormInteractionScope";

afterEach(() => vi.restoreAllMocks());

// React, context, effects and scope ownership are real. Only the native frame
// scheduler and field measurement callbacks are controlled, without wall time.
async function harness(blocksAppRestart = true) {
  const frames: Parameters<typeof requestAnimationFrame>[0][] = [];
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  let form: ReturnType<typeof useFormInteraction> | undefined;
  function FieldProbe() {
    form = useFormInteraction();
    return <Text>Editable fields</Text>;
  }
  const fixture = (revision: number) => (
    <FormInteractionScope sourceRevision={revision} blocksAppRestart={blocksAppRestart}>
      <FieldProbe />
    </FormInteractionScope>
  );
  const view = await render(fixture(1));
  if (!form) throw new Error("The real form context was not provided");
  const scope = form;
  const flush = async () => {
    await act(async () => {
      while (frames.length) frames.shift()?.(0);
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  function field(top: number, width = 100) {
    let invalid = true;
    const reveal = vi.fn();
    const target: InputScrollTarget = {
      measureInWindow: (callback) => callback(0, top, width, 44),
    };
    const unregister = scope.register({ target: () => target, invalid: () => invalid, reveal });
    return {
      reveal,
      unregister,
      valid: () => {
        invalid = false;
      },
    };
  }
  return {
    form: scope,
    field,
    flush,
    render: (revision: number) => view.rerender(fixture(revision)),
    unmount: () => view.unmount(),
  };
}

it("holds one restart block for the mounted form and lets the OTA scope opt out", async () => {
  const before = useAppRestartGuard.getState().blocks;
  const h = await harness();
  expect(useAppRestartGuard.getState().blocks).toBe(before + 1);
  await h.render(2);
  expect(useAppRestartGuard.getState().blocks).toBe(before + 1);
  await h.unmount();
  expect(useAppRestartGuard.getState().blocks).toBe(before);
  const ota = await harness(false);
  expect(useAppRestartGuard.getState().blocks).toBe(before);
  await ota.unmount();
  expect(useAppRestartGuard.getState().blocks).toBe(before);
});

it("uses measured visual order while skipping corrected, absent and invisible fields", async () => {
  const h = await harness();
  const lower = h.field(400),
    first = h.field(100),
    hidden = h.field(20, 0);
  const absent = vi.fn();
  h.form.register({ target: () => null, invalid: () => true, reveal: absent });
  h.form.requestFirstError();
  await h.flush();
  expect(first.reveal).toHaveBeenCalledOnce();
  expect(lower.reveal).not.toHaveBeenCalled();
  expect(hidden.reveal).not.toHaveBeenCalled();
  expect(absent).not.toHaveBeenCalled();
  first.valid();
  h.form.requestFirstError();
  await h.flush();
  expect(lower.reveal).toHaveBeenCalledOnce();
});

it.each(["cancel", "unregister", "correct", "unmount"] as const)(
  "rejects measured stale errors after %s",
  async (change) => {
    const h = await harness();
    let measured: Parameters<InputScrollTarget["measureInWindow"]>[0] | undefined;
    let invalid = true;
    const reveal = vi.fn();
    const target: InputScrollTarget = {
      measureInWindow: (callback) => {
        measured = callback;
      },
    };
    const unregister = h.form.register({ target: () => target, invalid: () => invalid, reveal });
    h.form.requestFirstError();
    await h.flush();
    expect(measured).toBeTypeOf("function");
    if (change === "cancel") h.form.cancelErrorFocus();
    if (change === "unregister") unregister();
    if (change === "correct") invalid = false;
    if (change === "unmount") await h.unmount();
    measured?.(0, 100, 100, 44);
    await h.flush();
    expect(reveal).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "expires revision-only callbacks before reveal (measured: %s)",
  async (measured) => {
    const h = await harness();
    let callback: Parameters<InputScrollTarget["measureInWindow"]>[0] | undefined;
    const reveal = vi.fn();
    const target: InputScrollTarget = {
      measureInWindow: (next) => {
        callback = next;
      },
    };
    h.form.register({ target: () => target, invalid: () => true, reveal });
    const ticket = h.form.deferFirstError();
    ticket.reveal();
    if (measured) await h.flush();
    await h.render(2);
    callback?.(0, 100, 100, 44);
    await h.flush();
    expect(ticket.isCurrent()).toBe(false);
    expect(reveal).not.toHaveBeenCalled();
    h.form.requestFirstError();
    await h.flush();
    callback?.(0, 100, 100, 44);
    await h.flush();
    expect(reveal).toHaveBeenCalledOnce();
  },
);

it("rejects obsolete deferred tickets and callbacks after unmount", async () => {
  const h = await harness();
  const field = h.field(20),
    old = h.form.deferFirstError();
  h.form.cancelErrorFocus();
  old.reveal();
  await h.flush();
  expect(old.isCurrent()).toBe(false);
  expect(field.reveal).not.toHaveBeenCalled();
  const ticket = h.form.deferFirstError();
  await h.unmount();
  ticket.reveal();
  h.form.requestFirstError();
  await h.flush();
  expect(ticket.isCurrent()).toBe(false);
  expect(field.reveal).not.toHaveBeenCalled();
});
