import { useBottomSheetInternal } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PixelRatio,
  type View,
} from "react-native";
import { useFormInteraction } from "@/components/common/ui/FormInteractionScope";
import type { InputScrollOwner, InputScrollTarget } from "./inputScrollContext";
import { inputScrollOffset } from "./inputScrollOffset";
import { useKeyboardHeight } from "./useKeyboardHeight";

type Scroller = { scrollTo: (options: { y: number; animated: boolean }) => void };
/** One owner per native scroll surface; only the focused field is measured. */
export function useInputScroll(getScroller: () => Scroller | null | undefined) {
  const viewport = useRef<View>(null);
  const scroller = useRef(getScroller);
  scroller.current = getScroller;
  const focused = useRef<{ target: InputScrollTarget; anchor?: InputScrollTarget | null } | null>(
    null,
  );
  const mounted = useRef(true);
  const generation = useRef(0);
  const offset = useRef(0);
  const [height, setHeight] = useState(0);
  const [requiredOffset, setRequiredOffset] = useState(0);
  const inSheet = Boolean(useBottomSheetInternal(true));
  const keyboardHeight = useKeyboardHeight();
  const form = useFormInteraction();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      focused.current = null;
    };
  }, []);
  const reveal = useCallback((target: InputScrollTarget, anchor?: InputScrollTarget | null) => {
    focused.current = { target, anchor };
    const version = ++generation.current;
    requestAnimationFrame(() => {
      if (!mounted.current || version !== generation.current) return;
      viewport.current?.measureInWindow((_x, top, _width, visibleHeight) => {
        target.measureInWindow((_left, fieldTop, width, fieldHeight) => {
          if (!mounted.current || version !== generation.current || width <= 0 || fieldHeight <= 0)
            return;
          const align = (anchorTop?: number) => {
            if (!mounted.current || version !== generation.current) return;
            const y = inputScrollOffset({
              offset: offset.current,
              fieldTop,
              fieldHeight,
              viewportTop: top,
              viewportHeight: visibleHeight,
              fontScale: PixelRatio.getFontScale(),
              anchorTop,
            });
            setHeight(visibleHeight);
            setRequiredOffset(y);
            // Wait for the new minimum scroll range before moving an empty/short list.
            requestAnimationFrame(() => {
              if (mounted.current && version === generation.current)
                scroller.current()?.scrollTo({ y, animated: false });
            });
          };
          if (anchor && anchor !== target)
            anchor.measureInWindow((_x, anchorTop) => align(anchorTop));
          else align(anchor ? fieldTop : undefined);
        });
      });
    });
  }, []);
  const blur = useCallback((target: InputScrollTarget) => {
    if (!focused.current || focused.current.target === target) {
      focused.current = null;
      generation.current++;
      setRequiredOffset(0);
    }
  }, []);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      setHeight(event.nativeEvent.layout.height);
      if (focused.current) reveal(focused.current.target, focused.current.anchor);
    },
    [reveal],
  );
  const touch = useCallback(() => form?.cancelErrorFocus(), [form]);
  const beginScroll = useCallback(() => {
    focused.current = null;
    generation.current++;
    touch();
  }, [touch]);
  const contentChanged = useCallback(() => {
    if (focused.current) reveal(focused.current.target, focused.current.anchor);
  }, [reveal]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);
  useEffect(() => {
    if (keyboardHeight >= 0 && focused.current)
      reveal(focused.current.target, focused.current.anchor);
  }, [keyboardHeight, reveal]);
  const owner = useMemo<InputScrollOwner>(
    () => ({ reveal, blur, inSheet }),
    [reveal, blur, inSheet],
  );
  return {
    viewport,
    onLayout,
    onScroll,
    beginScroll,
    touch,
    contentChanged,
    owner,
    minHeight: height + requiredOffset,
    inSheet,
  };
}
