import { createRequire } from "node:module";
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetScrollView,
  useBottomSheetInternal,
} from "@gorhom/bottom-sheet";
import { expect, it } from "vitest";

const nativeSheet = createRequire(import.meta.url)(
  "@gorhom/bottom-sheet",
) as typeof import("@gorhom/bottom-sheet");

it("shares the actual Gorhom provider, scrollables and context hook with native-owned HeroUI", () => {
  expect(BottomSheet).toBe(nativeSheet.default);
  expect(BottomSheetFlatList).toBe(nativeSheet.BottomSheetFlatList);
  expect(BottomSheetScrollView).toBe(nativeSheet.BottomSheetScrollView);
  expect(useBottomSheetInternal).toBe(nativeSheet.useBottomSheetInternal);
});
