import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BackHandler, type FlatList, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function useListSearchHeader<Row>(
  reset: () => void,
  onActiveChange?: (active: boolean) => void,
) {
  const navigation = useNavigation();
  const { top } = useSafeAreaInsets();
  const listRef = useRef<FlatList<Row>>(null);
  const [active, setActive] = useState(false);
  const scrollToStart = useCallback(
    () => listRef.current?.scrollToOffset({ offset: 0, animated: false }),
    [],
  );
  const open = useCallback(() => setActive(true), []);
  const close = useCallback(() => {
    Keyboard.dismiss();
    scrollToStart();
    reset();
    setActive(false);
  }, [reset, scrollToStart]);
  useLayoutEffect(() => {
    if (!active) return;
    navigation.setOptions({ headerShown: false });
    onActiveChange?.(true);
    scrollToStart();
    return () => {
      navigation.setOptions({ headerShown: true });
      onActiveChange?.(false);
    };
  }, [active, navigation, onActiveChange, scrollToStart]);
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      const back = BackHandler.addEventListener("hardwareBackPress", () => {
        close();
        return true;
      });
      return () => back.remove();
    }, [active, close]),
  );
  return useMemo(() => ({ active, open, close, listRef, top }), [active, open, close, top]);
}
