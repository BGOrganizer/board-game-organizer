import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { expect, it, vi } from "vitest";
import { useAppRestartGuard } from "@/lib/appRestartGuard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { ConfirmDialog } from "../ConfirmDialog";

it("shows the real confirmation dialog, executes the chosen action and blocks restarts while mounted", async () => {
  const cancel = vi.fn(),
    confirm = vi.fn(),
    before = useAppRestartGuard.getState().blocks;
  const view = await render(
    <ConfirmDialog
      title="Remove participant"
      description="This participant will leave the event."
      onCancel={cancel}
      actions={[{ label: "Remove", variant: "danger", onPress: confirm }]}
    >
      <Text>Group membership stays unchanged.</Text>
    </ConfirmDialog>,
    { wrapper: NativeTestProviders },
  );
  expect(screen.getByText("Remove participant")).toBeVisible();
  expect(screen.getByText("This participant will leave the event.")).toBeVisible();
  expect(screen.getByText("Group membership stays unchanged.")).toBeVisible();
  expect(useAppRestartGuard.getState().blocks).toBe(before + 1);
  await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(cancel).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId("confirmation-cancel"));
  expect(cancel).toHaveBeenCalledOnce();
  await view.unmount();
  expect(useAppRestartGuard.getState().blocks).toBe(before);
});

it("disables every decision while busy and restores cancellation and confirmation after completion", async () => {
  const cancel = vi.fn(),
    confirm = vi.fn();
  const fixture = (busy: boolean) => (
    <ConfirmDialog
      title="Confirm event"
      description="Accepted agreed tables will be frozen."
      busy={busy}
      onCancel={cancel}
      cancelLabel="Keep planning"
      cancelTestID="keep-planning"
      blocksAppRestart={false}
      actions={[{ label: "Confirm", variant: "primary", onPress: confirm, testID: "freeze" }]}
    />
  );
  const before = useAppRestartGuard.getState().blocks;
  const view = await render(fixture(true), { wrapper: NativeTestProviders });
  expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  expect(screen.getByTestId("keep-planning")).toBeDisabled();
  await fireEvent.press(screen.getByTestId("freeze"));
  await fireEvent.press(screen.getByTestId("keep-planning"));
  expect(confirm).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  expect(useAppRestartGuard.getState().blocks).toBe(before);
  await view.rerender(fixture(false));
  expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
  await fireEvent.press(screen.getByTestId("freeze"));
  await fireEvent.press(screen.getByTestId("keep-planning"));
  expect(confirm).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
});

it("keeps the dismissal path when there are no valid actions", async () => {
  const cancel = vi.fn();
  await render(
    <ConfirmDialog
      title="Details changed"
      description="Refresh the event before choosing an action."
      onCancel={cancel}
      actions={[]}
    />,
    { wrapper: NativeTestProviders },
  );
  expect(screen.getByText("Refresh the event before choosing an action.")).toBeVisible();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
});
