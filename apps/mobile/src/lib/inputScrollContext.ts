import { createContext, type RefObject } from "react";
import type { View } from "react-native";

export type InputScrollTarget = Pick<View, "measureInWindow"> & { focus?: () => void };
export type InputScrollOwner = {
  reveal: (target: InputScrollTarget, anchor?: InputScrollTarget | null) => void;
  blur: (target: InputScrollTarget) => void;
  inSheet: boolean;
};
export const InputScrollContext = createContext<InputScrollOwner | null>(null);
export const InputFieldContext = createContext<RefObject<View | null> | null>(null);
