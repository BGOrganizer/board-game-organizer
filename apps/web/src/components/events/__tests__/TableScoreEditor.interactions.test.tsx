import type { ScorePlayer, TableScoreInput } from "@board-game-organizer/shared";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { installInputBehavior } from "@/lib/inputBehavior";
import { renderWithI18n } from "@/test-utils";
import { TableScoreEditor } from "../TableScoreEditor";

const players: ScorePlayer[] = [
  { id: "a", name: "Alice", username: "alice", email: null, avatarUrl: null },
  { id: "b", name: "Bob", username: "bob", email: null, avatarUrl: null },
  { id: "c", name: "Carol", username: "carol", email: null, avatarUrl: null },
];
const scores = (
  values: (string | null)[],
  tieBreaks: TableScoreInput["tieBreaks"] = [],
): TableScoreInput => ({
  lowerWins: false,
  entries: values.map((score, index) => ({ userId: players[index].id, score })),
  tieBreaks,
});

async function openScore(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Score: ${name}` }));
  return screen.findByRole("textbox", { name: `Score: ${name}` });
}

async function closeScore() {
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
}

async function saveDraft() {
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  const confirmation = await screen.findByRole("dialog", { name: "Save result?" });
  fireEvent.click(within(confirmation).getByRole("button", { name: "Save result" }));
}

function expectBefore(first: string, second: string) {
  const firstIdentity = screen.getByText(first);
  const secondIdentity = screen.getByText(second);
  expect(
    firstIdentity.compareDocumentPosition(secondIdentity) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

it("keeps the real score popover stable while typing and toggles ND after the focused input hands off a pointer press", async () => {
  const submit = vi.fn();
  const isDialog = (node: HTMLElement) => node.getAttribute("role") === "dialog";
  const dialogHeight = (node: HTMLElement) =>
    200 + (Number.parseFloat(node.style.paddingBottom) || 0);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return isDialog(this) ? dialogHeight(this) : 600;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return isDialog(this) ? dialogHeight(this) : 600;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (isDialog(this)) return new DOMRect(0, 100, 256, dialogHeight(this));
    if (this.matches("[data-form-field]")) return new DOMRect(16, 160, 224, 70);
    return new DOMRect(16, 180, 224, 44);
  });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (
    this: HTMLElement,
  ) {
    return [this.getBoundingClientRect()] as unknown as DOMRectList;
  });
  const view = renderWithI18n(
    <TableScoreEditor players={players.slice(0, 2)} busy={false} onSubmit={submit} />,
  );
  const dispose = installInputBehavior();
  try {
    const input = await openScore("Alice");
    const dialog = input.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error("Missing score popover dialog");
    dialog.scrollTo = vi.fn();
    act(() => input.focus());
    await waitFor(() => expect(Number.parseFloat(dialog.style.paddingBottom)).toBeGreaterThan(0));
    const padding = dialog.style.paddingBottom;
    const height = dialog.clientHeight;
    for (const value of ["-", "-1", "-12", "-12.", "-12.5", "-12.50"]) {
      fireEvent.input(input, { target: { value } });
      await act(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });
      expect(input).toHaveValue(value);
      expect(document.activeElement).toBe(input);
      expect(dialog.style.paddingBottom).toBe(padding);
      expect(dialog.clientHeight).toBe(height);
    }
    const nd = screen.getByRole("switch", { name: "Did not participate: Alice" });
    fireEvent.pointerDown(nd, { pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.mouseDown(nd, { button: 0 });
    act(() => nd.focus());
    expect(dialog.style.paddingBottom).toBe(padding);
    fireEvent.pointerUp(nd, { pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.mouseUp(nd, { button: 0 });
    fireEvent.click(nd);
    expect(nd).toBeChecked();
    expect(input).toBeDisabled();
    expect(input).toHaveValue("-12.50");
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(dialog.style.paddingBottom).toBe(padding);
    fireEvent.click(nd);
    expect(nd).not.toBeChecked();
    expect(input).toBeEnabled();
    expect(input).toHaveValue("-12.50");
    expect(submit).not.toHaveBeenCalled();
  } finally {
    dispose();
    view.unmount();
    vi.restoreAllMocks();
  }
});

it("opens the first incomplete score, preserves invalid input, then saves a normalized decimal and explicit ND", async () => {
  const submit = vi.fn();
  renderWithI18n(<TableScoreEditor players={players.slice(0, 2)} busy={false} onSubmit={submit} />);
  const save = screen.getByRole("button", { name: "Save result" }) as HTMLButtonElement;
  fireEvent.click(save);
  const alice = await screen.findByRole("textbox", { name: "Score: Alice" });
  expect(alice.getAttribute("aria-invalid")).toBe("true");
  expect(alice.getAttribute("aria-required")).toBe("true");
  expect(screen.getByRole("alert").textContent).toBe("Enter a valid score");
  fireEvent.change(alice, { target: { value: "invalid" } });
  expect(screen.getByRole("alert").textContent).toBe("Enter a valid score");
  expect(save.disabled).toBe(true);
  await closeScore();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  const restored = await screen.findByRole("textbox", { name: "Score: Alice" });
  expect((restored as HTMLInputElement).value).toBe("invalid");
  fireEvent.change(restored, { target: { value: "12,50" } });
  expect(screen.queryByRole("alert")).toBeNull();
  await closeScore();
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  const bob = await screen.findByRole("textbox", { name: "Score: Bob" });
  fireEvent.click(screen.getByRole("switch", { name: "Did not participate: Bob" }));
  expect((bob as HTMLInputElement).disabled).toBe(true);
  expect(bob.getAttribute("aria-required")).toBe("false");
  expect(screen.queryByRole("alert")).toBeNull();
  await closeScore();
  await saveDraft();
  expect(submit).toHaveBeenCalledExactlyOnceWith({
    lowerWins: false,
    entries: [
      { userId: "a", score: "12.5" },
      { userId: "b", score: null },
    ],
    tieBreaks: [],
  });
});

it("keeps untouched score drafts and applies changes when the real popover dismisses with Escape", async () => {
  const submit = vi.fn();
  renderWithI18n(
    <TableScoreEditor
      players={players.slice(0, 2)}
      initial={scores(["5", "2"])}
      busy={false}
      onSubmit={submit}
    />,
  );
  const unchanged = await openScore("Alice");
  expect((unchanged as HTMLInputElement).value).toBe("5");
  await closeScore();
  const edited = await openScore("Alice");
  fireEvent.change(edited, { target: { value: "-3.500" } });
  fireEvent.keyDown(edited, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  expectBefore("bob", "alice");
  const reopened = await openScore("Alice");
  expect((reopened as HTMLInputElement).value).toBe("-3.500");
  await closeScore();
  await saveDraft();
  expect(submit).toHaveBeenCalledWith(scores(["-3.5", "2"]));
});

it("restores an ND player to a scored participant and keeps cancelled confirmation editable", async () => {
  const submit = vi.fn();
  renderWithI18n(
    <TableScoreEditor
      players={players.slice(0, 2)}
      initial={scores([null, "8"])}
      busy={false}
      onSubmit={submit}
    />,
  );
  const alice = await openScore("Alice");
  expect((alice as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("switch", { name: "Did not participate: Alice" }));
  expect((alice as HTMLInputElement).disabled).toBe(false);
  expect(alice.getAttribute("aria-required")).toBe("true");
  fireEvent.change(alice, { target: { value: "9" } });
  await closeScore();
  expectBefore("alice", "bob");
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  const confirmation = await screen.findByRole("dialog", { name: "Save result?" });
  fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog", { name: "Save result?" })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
  await saveDraft();
  expect(submit).toHaveBeenCalledExactlyOnceWith(scores(["9", "8"]));
});

it("edits a saved tie order in both directions, cancels, confirms and explicitly removes it", async () => {
  const submit = vi.fn();
  renderWithI18n(
    <TableScoreEditor
      players={players}
      initial={scores(["10", "10", "2"], [{ score: "10", orderedUserIds: ["b", "a"] }])}
      busy={false}
      onSubmit={submit}
    />,
  );
  expect(screen.getByText("Tie-break applied: 10")).toBeTruthy();
  expectBefore("bob", "alice");
  fireEvent.click(screen.getByRole("button", { name: "Edit tie-break" }));
  expect((screen.getByRole("button", { name: "Move up: Bob" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(
    (screen.getByRole("button", { name: "Move down: Alice" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole("button", { name: "Save result" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Move down: Bob" }));
  expectBefore("alice", "bob");
  fireEvent.click(screen.getByRole("button", { name: "Move up: Bob" }));
  expectBefore("bob", "alice");
  fireEvent.click(screen.getByRole("button", { name: "Move down: Bob" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expectBefore("bob", "alice");
  expect(screen.queryByRole("button", { name: "Confirm tie-break" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit tie-break" }));
  fireEvent.click(screen.getByRole("button", { name: "Move down: Bob" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm tie-break" }));
  expectBefore("alice", "bob");
  await saveDraft();
  expect(submit).toHaveBeenLastCalledWith(
    scores(["10", "10", "2"], [{ score: "10", orderedUserIds: ["a", "b"] }]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove tie-break" }));
  expect(screen.getByText("Tied score: 10")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit tie-break" })).toBeNull();
  await saveDraft();
  expect(submit).toHaveBeenLastCalledWith(scores(["10", "10", "2"]));
});

it("creates a three-player tie order and prunes that order after a score changes its participant set", async () => {
  const submit = vi.fn();
  renderWithI18n(
    <TableScoreEditor
      players={players}
      initial={scores(["10", "10", "10"])}
      busy={false}
      onSubmit={submit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Resolve tie" }));
  fireEvent.click(screen.getByRole("button", { name: "Move down: Alice" }));
  fireEvent.click(screen.getByRole("button", { name: "Move up: Carol" }));
  expectBefore("bob", "carol");
  expectBefore("carol", "alice");
  fireEvent.click(screen.getByRole("button", { name: "Confirm tie-break" }));
  await saveDraft();
  expect(submit).toHaveBeenLastCalledWith(
    scores(["10", "10", "10"], [{ score: "10", orderedUserIds: ["b", "c", "a"] }]),
  );
  fireEvent.change(await openScore("Alice"), { target: { value: "11" } });
  await closeScore();
  expect(screen.queryByText("Tie-break applied: 10")).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit tie-break" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove tie-break" })).toBeNull();
  expect(screen.getByText("Tied score: 10")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Resolve tie" })).toBeTruthy();
  await saveDraft();
  expect(submit).toHaveBeenLastCalledWith(scores(["11", "10", "10"]));
});

it("reverses standings through the browser view-transition boundary when lower scores win", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(document, "startViewTransition");
  const transition = vi.fn((update: () => void) => update());
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: transition });
  try {
    const submit = vi.fn();
    renderWithI18n(
      <TableScoreEditor
        players={players.slice(0, 2)}
        initial={scores(["1", "2"])}
        busy={false}
        onSubmit={submit}
      />,
    );
    expectBefore("bob", "alice");
    fireEvent.click(screen.getByRole("switch", { name: "Lowest score wins" }));
    expectBefore("alice", "bob");
    expect(transition).toHaveBeenCalledOnce();
    await saveDraft();
    expect(submit).toHaveBeenCalledExactlyOnceWith({ ...scores(["1", "2"]), lowerWins: true });
  } finally {
    if (descriptor) Object.defineProperty(document, "startViewTransition", descriptor);
    else Reflect.deleteProperty(document, "startViewTransition");
  }
});

it("honors a busy transition while editing and while save confirmation is already open", async () => {
  const submit = vi.fn();
  const initial = scores(["3", "2"]);
  const view = renderWithI18n(
    <TableScoreEditor
      players={players.slice(0, 2)}
      initial={initial}
      busy={false}
      onSubmit={submit}
    />,
  );
  await openScore("Alice");
  view.rerender(
    <TableScoreEditor players={players.slice(0, 2)} initial={initial} busy onSubmit={submit} />,
  );
  expect((screen.getByRole("textbox", { name: "Score: Alice" }) as HTMLInputElement).disabled).toBe(
    true,
  );
  expect(
    (screen.getByRole("switch", { name: "Did not participate: Alice" }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  await closeScore();
  expect((screen.getByRole("button", { name: "Score: Bob" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  view.rerender(
    <TableScoreEditor
      players={players.slice(0, 2)}
      initial={initial}
      busy={false}
      onSubmit={submit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  view.rerender(
    <TableScoreEditor players={players.slice(0, 2)} initial={initial} busy onSubmit={submit} />,
  );
  const confirmation = await screen.findByRole("dialog", { name: "Save result?" });
  expect(
    (within(confirmation).getByRole("button", { name: "Save result" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(within(confirmation).getByRole("button", { name: "Save result" }));
  expect(submit).not.toHaveBeenCalled();
});

it("does not offer save for an empty frozen roster", () => {
  const submit = vi.fn();
  renderWithI18n(<TableScoreEditor players={[]} busy={false} onSubmit={submit} />);
  expect((screen.getByRole("button", { name: "Save result" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /^Score:/ })).toBeNull();
});

it("rechecks score validity when an asynchronous browser view transition finishes after save confirmation opens", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(document, "startViewTransition");
  let updateSnapshot: (() => void) | undefined;
  const transition = vi.fn((update: () => void) => {
    updateSnapshot = update;
  });
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: transition });
  try {
    const submit = vi.fn();
    renderWithI18n(
      <TableScoreEditor
        players={players.slice(0, 2)}
        initial={scores(["20", "10"])}
        busy={false}
        onSubmit={submit}
      />,
    );
    fireEvent.change(await openScore("Alice"), { target: { value: "invalid score" } });
    await closeScore();
    expect(transition).toHaveBeenCalledOnce();
    expect(screen.getByText("20")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save result" }));
    const confirmation = await screen.findByRole("dialog", { name: "Save result?" });
    // The browser may deliver its snapshot/update callback after another UI
    // action. Keep the real confirmation open while that pending update lands.
    act(() => {
      if (!updateSnapshot) throw new Error("Expected the browser's pending view-transition update");
      updateSnapshot();
    });
    const save = within(confirmation).getByRole("button", { name: "Save result" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(submit).not.toHaveBeenCalled();
    expect(confirmation).toBeVisible();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Save result" }));
    expect(await screen.findByRole("textbox", { name: "Score: Alice" })).toHaveValue(
      "invalid score",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid score");
    expect(submit).not.toHaveBeenCalled();
  } finally {
    if (descriptor) Object.defineProperty(document, "startViewTransition", descriptor);
    else Reflect.deleteProperty(document, "startViewTransition");
  }
});
