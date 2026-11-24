import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { UserRoundX } from "lucide-react-native";
import { expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { MemberActions } from "../MemberActions";

it("closes the actual moderation menu on Cancel without dispatching the member action", async () => {
  const remove = vi.fn();
  const openChange = vi.fn();
  const actions = [
    { action: "remove", label: "Remove member", icon: <UserRoundX size={16} /> },
  ] as const;
  const fixture = (busy: boolean) => (
    <MemberActions
      title="Manage Pat"
      items={actions}
      busy={busy}
      onAction={remove}
      onOpenChange={openChange}
    />
  );
  const view = await render(fixture(false), { wrapper: NativeTestProviders });
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Manage Pat" }));
  expect(openChange).toHaveBeenLastCalledWith(true);
  const sheet = { includeHiddenElements: true };
  expect(await screen.findByRole("button", { name: "Remove member", ...sheet })).toBeEnabled();
  await view.rerender(fixture(true));
  expect(screen.getByRole("button", { name: "Remove member", ...sheet })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Cancel", ...sheet }));
  expect(openChange.mock.calls).toEqual([[true], [false]]);
  expect(remove).not.toHaveBeenCalled();

  await view.rerender(fixture(false));
  await user.press(screen.getByRole("button", { name: "Manage Pat" }));
  await fireEvent.press(screen.getByRole("button", { name: "Remove member", ...sheet }));
  expect(openChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  expect(remove).toHaveBeenCalledExactlyOnceWith("remove");
});
