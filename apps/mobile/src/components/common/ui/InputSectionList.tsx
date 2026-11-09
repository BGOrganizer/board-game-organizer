import { BottomSheetSectionList } from "@gorhom/bottom-sheet";
import { useHeaderHeight } from "expo-router/react-navigation";
import { type Ref, useImperativeHandle, useRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SectionList,
  type SectionListProps,
  StyleSheet,
  View,
} from "react-native";
import { InputFieldContext, InputScrollContext } from "@/lib/inputScrollContext";
import { useInputScroll } from "@/lib/useInputScroll";

export function InputSectionList<T, S = Record<string, unknown>>({
  ref,
  style,
  contentContainerStyle,
  onScroll,
  ...props
}: SectionListProps<T, S> & { ref?: Ref<SectionList<T, S>> }) {
  const list = useRef<SectionList<T, S>>(null);
  const focusScroll = useRef(false);
  useImperativeHandle(ref, () => list.current!, []);
  const scroll = useInputScroll(() => ({
    scrollTo: (options) => {
      focusScroll.current = true;
      list.current?.getScrollResponder()?.scrollTo(options);
    },
  }));
  const headerHeight = useHeaderHeight();
  const Component = (scroll.inSheet ? BottomSheetSectionList : SectionList) as typeof SectionList<
    T,
    S
  >;
  const minHeight = StyleSheet.flatten(contentContainerStyle)?.minHeight;
  return (
    <KeyboardAvoidingView
      style={style ?? { flex: 1 }}
      behavior={Platform.OS === "ios" && !scroll.inSheet ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <View
        ref={scroll.viewport}
        onLayout={scroll.onLayout}
        onTouchStart={scroll.touch}
        style={{ flex: 1 }}
      >
        <InputScrollContext.Provider value={scroll.owner}>
          <InputFieldContext.Provider value={null}>
            <Component
              {...props}
              ref={list}
              style={{ flex: 1 }}
              keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? "handled"}
              initialNumToRender={props.initialNumToRender ?? 8}
              maxToRenderPerBatch={props.maxToRenderPerBatch ?? 6}
              windowSize={props.windowSize ?? 7}
              scrollEventThrottle={props.scrollEventThrottle ?? 16}
              onScroll={(event) => {
                scroll.onScroll(event);
                onScroll?.(event);
              }}
              onContentSizeChange={(width, height) => {
                scroll.contentChanged();
                props.onContentSizeChange?.(width, height);
              }}
              onScrollBeginDrag={(event) => {
                scroll.beginScroll();
                focusScroll.current = false;
                props.onScrollBeginDrag?.(event);
                const { contentSize, layoutMeasurement, contentOffset } = event.nativeEvent;
                const distanceFromEnd =
                  contentSize.height - layoutMeasurement.height - contentOffset.y;
                if (
                  distanceFromEnd <=
                  layoutMeasurement.height * (props.onEndReachedThreshold ?? 2)
                )
                  props.onEndReached?.({ distanceFromEnd });
              }}
              onMomentumScrollBegin={(event) => {
                scroll.beginScroll();
                focusScroll.current = false;
                props.onMomentumScrollBegin?.(event);
                const { contentSize, layoutMeasurement, contentOffset } = event.nativeEvent;
                const distanceFromEnd =
                  contentSize.height - layoutMeasurement.height - contentOffset.y;
                if (
                  distanceFromEnd <=
                  layoutMeasurement.height * (props.onEndReachedThreshold ?? 2)
                )
                  props.onEndReached?.({ distanceFromEnd });
              }}
              onEndReached={(event) => {
                if (!focusScroll.current) props.onEndReached?.(event);
              }}
              contentContainerStyle={[
                contentContainerStyle,
                {
                  minHeight: Math.max(
                    scroll.minHeight + (props.onEndReached ? 1 : 0),
                    typeof minHeight === "number" ? minHeight : 0,
                  ),
                },
              ]}
            />
          </InputFieldContext.Provider>
        </InputScrollContext.Provider>
      </View>
    </KeyboardAvoidingView>
  );
}
