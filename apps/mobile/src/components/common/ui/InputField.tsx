import { type ReactNode, useContext, useEffect, useRef } from "react";
import { View, type ViewProps } from "react-native";
import { InputFieldContext, InputScrollContext } from "@/lib/inputScrollContext";
import { useFormInteraction } from "./FormInteractionScope";

/** Keep label with its field; reveal blocking selectors without opening their pickers. */
export function InputField({
  invalid = false,
  children,
  ...props
}: ViewProps & { invalid?: boolean; children: ReactNode }) {
  const ref = useRef<View>(null);
  const form = useFormInteraction(),
    owner = useContext(InputScrollContext);
  const error = useRef(invalid);
  error.current = invalid;
  useEffect(
    () =>
      form?.register({
        target: () => ref.current,
        invalid: () => error.current,
        reveal: () => {
          if (ref.current) owner?.reveal(ref.current, ref.current);
        },
      }),
    [form, owner],
  );
  return (
    <InputFieldContext.Provider value={ref}>
      <View {...props} ref={ref}>
        {children}
      </View>
    </InputFieldContext.Provider>
  );
}
