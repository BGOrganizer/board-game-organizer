import { useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { screenFloatingActionLayout } from "./floating-actions";

export function useFloatingActionLayout() {
  const { bottom } = useSafeAreaInsets();
  const navigation = useNavigation();
  return screenFloatingActionLayout(bottom, navigation.getState()?.type ?? "stack");
}
