import { Tabs } from "@heroui/react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Info, UsersRound } from "lucide-react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { TabBar } from "../TabBar";
import { TabTrigger } from "../TabTrigger";

it("inherits HeroUI tab colors for decorative icons while keeping selection, actions and panels", () => {
  const onPress = vi.fn();
  renderWithI18n(
    <Tabs defaultSelectedKey="info">
      <TabBar label="Sections">
        <TabTrigger icon={Info} id="info" className="relative">
          Overview
        </TabTrigger>
        <TabTrigger icon={UsersRound} id="members" onPress={onPress}>
          {(state) => <span>{state.isSelected ? "Members selected" : "Members"}</span>}
        </TabTrigger>
      </TabBar>
      <Tabs.Panel id="info">Information</Tabs.Panel>
      <Tabs.Panel id="members">People</Tabs.Panel>
    </Tabs>,
  );
  const info = screen.getByRole("tab", { name: "Overview" });
  const members = screen.getByRole("tab", { name: "Members" });
  expect(info.getAttribute("aria-selected")).toBe("true");
  expect(info.querySelectorAll('[data-slot="tabs-indicator"]')).toHaveLength(1);
  expect(info.querySelector("svg")).toHaveClass("size-4", "shrink-0");
  expect(info.querySelector("svg")).not.toHaveAttribute("style");
  expect(info.querySelector("svg")?.className.baseVal).not.toMatch(/text-/);
  expect(info.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(info.classList.contains("relative")).toBe(true);
  expect(members.querySelector("svg")?.className.baseVal).not.toMatch(/text-/);
  fireEvent.click(members);
  expect(onPress).toHaveBeenCalledOnce();
  expect(screen.getByRole("tabpanel").textContent).toContain("People");
  expect(members.getAttribute("aria-selected")).toBe("true");
  expect(members.querySelectorAll('[data-slot="tabs-indicator"]')).toHaveLength(1);
  expect(members.querySelector("svg")?.className.baseVal).not.toMatch(/text-/);
  expect(info.querySelector("svg")?.className.baseVal).not.toMatch(/text-/);
});

it("keeps keyboard navigation, disabled tabs and notification content with the stock indicator", async () => {
  renderWithI18n(
    <Tabs defaultSelectedKey="info">
      <TabBar label="Sections">
        <TabTrigger icon={Info} id="info">
          Overview
        </TabTrigger>
        <TabTrigger icon={UsersRound} id="disabled" isDisabled>
          Unavailable
        </TabTrigger>
        <TabTrigger icon={UsersRound} id="members">
          Members{" "}
          <span aria-hidden data-testid="unread-dot">
            ●
          </span>
        </TabTrigger>
      </TabBar>
      <Tabs.Panel id="info">Information</Tabs.Panel>
      <Tabs.Panel id="disabled">Unavailable content</Tabs.Panel>
      <Tabs.Panel id="members">People</Tabs.Panel>
    </Tabs>,
  );
  const info = screen.getByRole("tab", { name: "Overview" });
  const members = screen.getByRole("tab", { name: "Members" });
  expect(screen.getByRole("tab", { name: "Unavailable" })).toHaveAttribute("aria-disabled", "true");
  act(() => info.focus());
  fireEvent.keyDown(info, { key: "ArrowRight", code: "ArrowRight" });
  await waitFor(() => expect(members).toHaveAttribute("aria-selected", "true"));
  expect(members.querySelectorAll('[data-slot="tabs-indicator"]')).toHaveLength(1);
  expect(screen.getByTestId("unread-dot")).toBeVisible();
  expect(screen.getByRole("tabpanel")).toHaveTextContent("People");
});
