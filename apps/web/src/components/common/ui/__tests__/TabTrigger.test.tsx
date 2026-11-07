import { Tabs } from "@heroui/react";
import { fireEvent, screen } from "@testing-library/react";
import { Info, UsersRound } from "lucide-react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { TabBar } from "../TabBar";
import { TabTrigger } from "../TabTrigger";

it("keeps HeroUI selection, actions and panels while coloring only the selected decorative icon", () => {
  const onPress = vi.fn();
  renderWithI18n(
    <Tabs defaultSelectedKey="info">
      <TabBar label="Sections">
        <TabTrigger icon={Info} id="info" className="relative">
          Overview
          <Tabs.Indicator />
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
  expect(info.querySelector("svg")?.classList.contains("text-accent")).toBe(true);
  expect(info.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(info.classList.contains("relative")).toBe(true);
  expect(members.querySelector("svg")?.classList.contains("text-muted")).toBe(true);
  fireEvent.click(members);
  expect(onPress).toHaveBeenCalledOnce();
  expect(screen.getByRole("tabpanel").textContent).toContain("People");
  expect(members.getAttribute("aria-selected")).toBe("true");
  expect(members.querySelector("svg")?.classList.contains("text-accent")).toBe(true);
  expect(info.querySelector("svg")?.classList.contains("text-muted")).toBe(true);
});
