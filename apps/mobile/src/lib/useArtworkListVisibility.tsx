import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
  type ViewToken,
} from "react-native";
import { ArtworkHeaderContext, ArtworkVisibility } from "@/components/common/ui/ArtworkVisibility";
import { createArtworkVisibility } from "./artworkVisibility";

/** Resource rows opt into native list viewability without replacing any scrolling/input adapter. */
type Viewability = { viewableItems: ViewToken[]; changed: ViewToken[] };
export function useArtworkListVisibility(onViewableItemsChanged?: (info: Viewability) => void) {
  const [store] = useState(createArtworkVisibility);
  const ref = useRef<View>(null);
  const originalViewability = useRef(onViewableItemsChanged);
  useLayoutEffect(() => {
    originalViewability.current = onViewableItemsChanged;
  }, [onViewableItemsChanged]);
  const headerContext = useMemo(() => ({ store, ref }), [store]);
  return useMemo(
    () => ({
      onViewableItemsChanged: (info: Viewability) => {
        store.update(info.viewableItems);
        originalViewability.current?.(info);
      },
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
        store.scroll(event.nativeEvent.contentOffset.y, event.nativeEvent.layoutMeasurement.height),
      onLayout: (event: LayoutChangeEvent) => store.viewport(event.nativeEvent.layout.height),
      row: (id: string, children: ReactNode) => (
        <ArtworkVisibility store={store} id={id}>
          {children}
        </ArtworkVisibility>
      ),
      header: (children: ReactNode) =>
        children === undefined || children === null || children === false ? null : (
          <ArtworkHeaderContext value={headerContext}>
            <ArtworkVisibility store={store} id={store.headerKey}>
              <View
                ref={ref}
                collapsable={false}
                onLayout={({ nativeEvent: { layout } }) =>
                  store.headerLayout(layout.y, layout.height)
                }
              >
                {children}
              </View>
            </ArtworkVisibility>
          </ArtworkHeaderContext>
        ),
    }),
    [store, headerContext],
  );
}
