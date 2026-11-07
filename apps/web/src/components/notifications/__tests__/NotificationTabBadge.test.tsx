import type {
  NotificationAttentionCount,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { NotificationTabBadge } from "../NotificationTabBadge";

const state = vi.hoisted(() => ({
  value: undefined as
    | { get: (target: NotificationAttentionTarget) => NotificationAttentionCount | undefined }
    | undefined,
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<object>()),
  useNotificationAttentionContext: () => state.value,
}));
const target = { kind: "group", id: "group" } as const;
function row(count: number, direct = 0): NotificationAttentionCount {
  return { target, count, direct, events: 0, sections: { connections: 0, requests: 0, search: 0 } };
}
it("shows one stock danger dot for known unread tab scope and removes it at zero/unknown", () => {
  state.value = undefined;
  const ui = renderWithI18n(<NotificationTabBadge target={target} />);
  expect(screen.queryByRole("img")).toBeNull();
  state.value = { get: () => row(2) };
  ui.rerender(<NotificationTabBadge target={target} />);
  expect(screen.getAllByRole("img", { name: "Needs attention" })).toHaveLength(1);
  expect(screen.getByRole("img").className).toContain("badge--danger");
  state.value = { get: () => row(0) };
  ui.rerender(<NotificationTabBadge target={target} />);
  expect(screen.queryByRole("img")).toBeNull();
  state.value = { get: () => undefined };
  ui.rerender(<NotificationTabBadge target={target} />);
  expect(screen.queryByRole("img")).toBeNull();
});
it("Overview combines generic/direct and its own items, never member or descendant counts", () => {
  state.value = { get: (t) => (t.kind === "group" ? row(5) : undefined) };
  const ui = renderWithI18n(
    <NotificationTabBadge target={target} overviewItems={["overview", "invitation"]} />,
  );
  expect(screen.queryByRole("img")).toBeNull();
  state.value = {
    get: (t) => (t.kind === "group" ? row(5) : t.id === "invitation" ? row(1) : undefined),
  };
  ui.rerender(<NotificationTabBadge target={target} overviewItems={["overview", "invitation"]} />);
  expect(screen.getAllByRole("img")).toHaveLength(1);
  state.value = { get: (t) => (t.kind === "group" ? row(5, 1) : undefined) };
  ui.rerender(<NotificationTabBadge target={target} overviewItems={[]} />);
  expect(screen.getAllByRole("img")).toHaveLength(1);
  state.value = undefined;
  ui.rerender(<NotificationTabBadge target={target} overviewItems={["overview"]} />);
  expect(screen.queryByRole("img")).toBeNull();
});
