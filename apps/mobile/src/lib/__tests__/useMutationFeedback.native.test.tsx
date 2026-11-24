import { act, renderHook, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { useMutationFeedback } from "../useMutationFeedback";

it("shows the specific BoardGameGeek identity error without replacing it with the generic link failure", async () => {
  const { result } = await renderHook(useMutationFeedback, { wrapper: NativeTestProviders });
  const onError = result.current.onError;
  if (!onError) throw new Error("Expected the native mutation error presenter");
  await act(() => onError(new Error("BGG user not found"), "link_bgg"));

  expect(await screen.findAllByText("BGG user not found")).not.toHaveLength(0);
  expect(screen.queryAllByText("Could not link BoardGameGeek account")).toHaveLength(0);
});
