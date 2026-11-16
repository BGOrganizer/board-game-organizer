import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useSyncExternalStore,
} from "react";
import type { View } from "react-native";
import type { ArtworkVisibility as Visibility } from "@/lib/artworkVisibility";

export const ArtworkVisibleContext = createContext(true);
export const ArtworkHeaderContext = createContext<{
  store: Visibility;
  ref: RefObject<View | null>;
} | null>(null);

export function ArtworkVisibility({
  store,
  id,
  children,
}: {
  store: Visibility;
  id: string;
  children: ReactNode;
}) {
  const subscribe = useCallback(
    (callback: () => void) => store.subscribe(id, callback),
    [store, id],
  );
  const snapshot = useCallback(() => store.isVisible(id), [store, id]);
  const visible = useSyncExternalStore(subscribe, snapshot, () => false);
  return <ArtworkVisibleContext value={visible}>{children}</ArtworkVisibleContext>;
}
