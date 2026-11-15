import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
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
import { useOptionalHeaderHeight } from "@/lib/useOptionalHeaderHeight";

export function InputScrollView({
  ref,
  style,
  contentContainerStyle,
  onScroll,
  sizing = "fill",
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollView>; sizing?: "fill" | "content" }) {
  const list = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => list.current!, []);
  const scroll = useInputScroll(() => list.current);
  const headerHeight = useOptionalHeaderHeight();
  const Component = (scroll.inSheet ? BottomSheetScrollView : ScrollView) as typeof ScrollView;
  const minHeight = StyleSheet.flatten(contentContainerStyle)?.minHeight;
  const contentSized = sizing === "content";
  // A fully rendered dialog already has its natural scroll range. Reusing the viewport's
  // reveal padding here would feed content height back into its own measured viewport.
  const revealHeight = contentSized ? 0 : scroll.minHeight;
  return (
    <KeyboardAvoidingView
      style={style ?? (contentSized ? { flexShrink: 1 } : { flex: 1 })}
      behavior={Platform.OS === "ios" && !scroll.inSheet ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <View
        ref={scroll.viewport}
        onLayout={scroll.onLayout}
        onTouchStart={scroll.touch}
        style={{ flexGrow: contentSized ? 0 : 1, flexShrink: 1 }}
      >
        <InputScrollContext.Provider value={scroll.owner}>
          <InputFieldContext.Provider value={null}>
            <Component
              {...props}
              ref={list}
              style={{ flexGrow: contentSized ? 0 : 1, flexShrink: 1 }}
              bounces={props.bounces ?? (contentSized ? false : undefined)}
              alwaysBounceVertical={
                props.alwaysBounceVertical ?? (contentSized ? false : undefined)
              }
              overScrollMode={props.overScrollMode ?? (contentSized ? "never" : undefined)}
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
                  minHeight: Math.max(revealHeight, typeof minHeight === "number" ? minHeight : 0),
                },
              ]}
            />
          </InputFieldContext.Provider>
        </InputScrollContext.Provider>
      </View>
    </KeyboardAvoidingView>
  );
}
