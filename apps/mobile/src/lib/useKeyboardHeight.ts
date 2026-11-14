import { useSyncExternalStore } from "react";
import { Keyboard, Platform } from "react-native";

let height = 0;
const listeners = new Set<() => void>();
let remove: (() => void) | undefined;
const snapshot = () => height;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!remove) {
    const shown = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow",
      (event) => {
        height = Math.max(0, event.endCoordinates.height);
        for (const update of listeners) update();
      },
    );
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      height = 0;
      for (const update of listeners) update();
    });
    height = Keyboard.metrics()?.height ?? 0;
    remove = () => {
      shown.remove();
      hidden.remove();
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      remove?.();
      remove = undefined;
      height = 0;
    }
  };
}
export function useKeyboardHeight() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
