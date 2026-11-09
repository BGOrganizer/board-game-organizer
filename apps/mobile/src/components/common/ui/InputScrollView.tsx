import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useHeaderHeight } from "expo-router/react-navigation";
import { type Ref, useImperativeHandle, useRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
} from "react-native";
import { InputFieldContext, InputScrollContext } from "@/lib/inputScrollContext";
import { useInputScroll } from "@/lib/useInputScroll";

export function InputScrollView({
  ref,
  style,
  contentContainerStyle,
  onScroll,
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  const list = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => list.current!, []);
  const scroll = useInputScroll(() => list.current);
  const headerHeight = useHeaderHeight();
  const Component = (scroll.inSheet ? BottomSheetScrollView : ScrollView) as typeof ScrollView;
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
        style={{ flexGrow: 1, flexShrink: 1 }}
      >
        <InputScrollContext.Provider value={scroll.owner}>
          <InputFieldContext.Provider value={null}>
            <Component
              {...props}
              ref={list}
              style={{ flexGrow: 1, flexShrink: 1 }}
              keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? "handled"}
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
                props.onScrollBeginDrag?.(event);
              }}
              contentContainerStyle={[
                contentContainerStyle,
                {
                  minHeight: Math.max(
                    scroll.minHeight,
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
