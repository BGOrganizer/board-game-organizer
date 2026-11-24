import { act, cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { createRef } from "react";
import { Pressable, Text, TextInput } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import {
  FormInteractionScope,
  useFormInteraction,
} from "@/components/common/ui/FormInteractionScope";
import { Input } from "@/components/common/ui/Input";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { InputScrollContext } from "../inputScrollContext";
import { useInputFocus } from "../useInputFocus";

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

function Submit() {
  const form = useFormInteraction();
  return (
    <Pressable accessibilityRole="button" onPress={() => form?.requestFirstError()}>
      <Text>Validate draft</Text>
    </Pressable>
  );
}

it("reveals and focuses the mounted invalid input when the real form requests error focus", async () => {
  const reveal = vi.fn(),
    blur = vi.fn();
  const ref = createRef<TextInput>();
  const frames: Parameters<typeof requestAnimationFrame>[0][] = [];
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  await render(
    <NativeTestProviders>
      <InputScrollContext value={{ reveal, blur, inSheet: false }}>
        <FormInteractionScope>
          <Input ref={ref} isInvalid testID="missing-value" />
          <Submit />
        </FormInteractionScope>
      </InputScrollContext>
    </NativeTestProviders>,
  );
  const field = ref.current;
  if (!field) throw new Error("Expected the actual forwarded native input");
  const focus = vi.spyOn(field, "focus").mockImplementation(() => {});
  vi.spyOn(field, "measureInWindow").mockImplementation((measure) => measure(0, 460, 280, 44));

  frames.length = 0;
  await fireEvent.press(screen.getByRole("button", { name: "Validate draft" }));
  const first = frames.shift();
  if (!first) throw new Error("Expected deferred form validation");
  await act(() => first(0));
  const next = frames.shift();
  if (!next) throw new Error("Expected native layout to settle before measuring invalid fields");
  await act(() => next(16));
  expect(focus).toHaveBeenCalledOnce();
  expect(reveal).toHaveBeenCalledExactlyOnceWith(field, undefined);
});

it("keeps a bottom-sheet input from scrolling the inherited screen owner", async () => {
  const reveal = vi.fn(),
    blur = vi.fn(),
    onFocus = vi.fn(),
    onBlur = vi.fn();
  await render(
    <NativeTestProviders>
      <BottomSheet isOpen>
        <BottomSheet.Portal>
          <BottomSheet.Content snapPoints={["80%"]} enableDynamicSizing={false}>
            <InputScrollContext value={{ reveal, blur, inSheet: false }}>
              <Input testID="sheet-field" onFocus={onFocus} onBlur={onBlur} />
            </InputScrollContext>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </NativeTestProviders>,
  );
  const input = screen.getByTestId("sheet-field", { includeHiddenElements: true });
  await fireEvent(input, "focus", { nativeEvent: { target: 17 } });
  await fireEvent(input, "blur", { nativeEvent: { target: 17 } });

  expect(onFocus).toHaveBeenCalledOnce();
  expect(onBlur).toHaveBeenCalledOnce();
  expect(reveal).not.toHaveBeenCalled();
  expect(blur).not.toHaveBeenCalled();
});

it("does not ask the scroll owner to move for retained native callbacks after the host is gone", async () => {
  const reveal = vi.fn(),
    blur = vi.fn();
  let callbacks: ReturnType<typeof useInputFocus> | undefined;
  function Probe({ attached }: { attached: boolean }) {
    const focus = useInputFocus({});
    if (attached) callbacks = focus;
    return attached ? <TextInput {...focus} testID="original-input" /> : null;
  }
  const owner = { reveal, blur, inSheet: false };
  const fixture = (attached: boolean) => (
    <InputScrollContext value={owner}>
      <Probe attached={attached} />
    </InputScrollContext>
  );
  const view = await render(fixture(true));
  expect(screen.getByTestId("original-input")).toBeOnTheScreen();
  if (!callbacks) throw new Error("Expected native callbacks from the mounted host");
  const { onFocus, onBlur, ref } = callbacks;
  expect(ref.current).not.toBeNull();
  await view.rerender(fixture(false));
  expect(ref.current).toBeNull();
  await act(() => {
    onFocus({ nativeEvent: { target: 17 } } as Parameters<typeof onFocus>[0]);
    onBlur({ nativeEvent: { target: 17 } } as Parameters<typeof onBlur>[0]);
  });
  expect(reveal).not.toHaveBeenCalled();
  expect(blur).not.toHaveBeenCalled();
});
