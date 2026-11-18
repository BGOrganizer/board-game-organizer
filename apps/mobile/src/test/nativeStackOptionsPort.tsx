import type { ReactNode } from "react";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { View } from "react-native";

/** External Expo/React Navigation options port: merges updates exactly as setOptions does.
 * Header renderers are supplied by the real screen; no application UI is substituted.
 */
type Options = {
  title?: string;
  headerBackVisible?: boolean;
  gestureEnabled?: boolean;
  headerTitle?: (props: { children: string }) => ReactNode;
  headerLeft?: (props: { canGoBack?: boolean }) => ReactNode;
};
let snapshot: Options = {};
const subscribers = new Set<() => void>();
const subscribe = (notify: () => void) => {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
};
export function resetNativeStackOptionsPort() {
  snapshot = {};
}
export function nativeStackOptionsSnapshot() {
  return snapshot;
}
export function NativeStackScreen({ options }: { options: Options }) {
  useLayoutEffect(() => {
    snapshot = { ...snapshot, ...options };
    for (const notify of subscribers) notify();
  }, [options]);
  return null;
}
export function NativeStackHeader({ canGoBack = true }: { canGoBack?: boolean }) {
  const options = useSyncExternalStore(subscribe, nativeStackOptionsSnapshot);
  return (
    <View testID="native-stack-header">
      {options.headerLeft?.({ canGoBack })}
      {options.headerTitle?.({ children: options.title ?? "" })}
    </View>
  );
}
