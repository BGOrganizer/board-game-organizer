import { useBottomSheetInternal } from "@gorhom/bottom-sheet";
import { useBottomSheetAwareHandlers } from "heroui-native/hooks";
import type { InputProps } from "heroui-native/input";
import { type Ref, useContext, useEffect, useImperativeHandle, useRef } from "react";
import type { TextInput } from "react-native";
import { useFormInteraction } from "@/components/common/ui/FormInteractionScope";
import { InputFieldContext, InputScrollContext } from "./inputScrollContext";

export function useInputFocus({
  ref: forwardedRef,
  onFocus,
  onBlur,
  isInvalid,
}: {
  ref?: Ref<TextInput>;
  onFocus?: InputProps["onFocus"];
  onBlur?: InputProps["onBlur"];
  isInvalid?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  useImperativeHandle(forwardedRef, () => ref.current!, []);
  const context = useContext(InputScrollContext);
  const field = useContext(InputFieldContext);
  const inSheet = Boolean(useBottomSheetInternal(true));
  const owner = inSheet && !context?.inSheet ? null : context;
  const sheet = useBottomSheetAwareHandlers();
  const form = useFormInteraction();
  const invalid = useRef(isInvalid);
  invalid.current = isInvalid;
  useEffect(
    () =>
      form?.register({
        target: () => ref.current,
        invalid: () => Boolean(invalid.current),
        reveal: () => {
          if (!ref.current) return;
          ref.current.focus();
          owner?.reveal(ref.current, field?.current);
        },
      }),
    [form, owner, field],
  );
  return {
    ref,
    onFocus: ((event) => {
      form?.cancelErrorFocus();
      sheet.onFocus(event);
      onFocus?.(event);
      if (ref.current) owner?.reveal(ref.current, field?.current);
    }) satisfies NonNullable<InputProps["onFocus"]>,
    onBlur: ((event) => {
      sheet.onBlur(event);
      onBlur?.(event);
      if (ref.current) owner?.blur(ref.current);
    }) satisfies NonNullable<InputProps["onBlur"]>,
  };
}
