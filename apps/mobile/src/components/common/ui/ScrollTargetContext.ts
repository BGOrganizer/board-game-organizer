import { createContext, type RefObject } from "react";
import type { ScrollView } from "react-native";
export const ScrollTargetContext = createContext<RefObject<ScrollView | null> | null>(null);
