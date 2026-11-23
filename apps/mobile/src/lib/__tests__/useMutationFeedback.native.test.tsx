import { act, renderHook, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { useMutationFeedback } from "../useMutationFeedback";

it.each([
  {
    action: "ban_group_member",
    error: "BAN_FROZEN_PARTICIPATION",
    message: "This user is involved in a frozen public event and cannot be excluded.",
  },
  {
    action: "ban_group_member",
    error: "Group action unavailable",
    message: "Could not apply group ban",
  },
  {
    action: "link_bgg",
    error: "BGG user not found",
    message: "BGG user not found",
  },
  {
    action: "link_bgg",
    error: "Service unavailable",
    message: "Could not link BoardGameGeek account",
  },
] as const)(
  "selects the public feedback for $action ($error)",
  async ({ action, error, message }) => {
    const { result } = await renderHook(useMutationFeedback, { wrapper: NativeTestProviders });
    await act(() => result.current.onError?.(new Error(error), action));
    // HeroUI also renders the hidden layout copy while measuring the toast.
    expect(await screen.findAllByText(message, { includeHiddenElements: true })).not.toHaveLength(
      0,
    );
    if (error !== message)
      expect(screen.queryByText(error, { includeHiddenElements: true })).toBeNull();
  },
);
