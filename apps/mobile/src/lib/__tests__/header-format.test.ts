import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";
import { HEADER_ICON_SIZE, headerButtonProps } from "../../components/common/layout/headerStyles";

const source = (path: string) =>
  readFileSync(new URL(`../../components/${path}.tsx`, import.meta.url), "utf8");
it("keeps application header glyphs at 20 and HeroUI sm actions reachable at 44", () => {
  expect(HEADER_ICON_SIZE).toBe(20);
  expect(headerButtonProps).toEqual({
    size: "sm",
    isIconOnly: true,
    style: { minWidth: 44, minHeight: 44 },
  });
  expect(source("common/layout/HeaderTitle")).toContain("size={HEADER_ICON_SIZE}");
  expect(source("common/layout/Header")).toContain("size={HEADER_ICON_SIZE}");
  for (const path of [
    "events/EventDetail",
    "events/EventDeleteAction",
    "groups/GroupDetail",
    "notifications/NotificationBell",
  ]) {
    expect(source(path)).toContain("{...headerButtonProps}");
    expect(source(path)).toContain("size={HEADER_ICON_SIZE}");
  }
});
it("preserves guarded native Back routes while custom close/back actions use the same small control", () => {
  const back = source("common/layout/HeaderBackButton");
  expect(back).toContain("{...headerButtonProps}");
  expect(back).toContain("onPress={onPress}");
  expect(back).toContain("isDisabled={disabled}");
  for (const path of ["events/EventWizard", "events/EventResults", "games/GamePicker"])
    expect(source(path)).toContain("<HeaderBackButton");
  expect(source("locations/LocationPicker")).toContain("usePreventRemove(Boolean(onClose)");
});
it("keeps the centered indicator outside card navigation and one Table legend per list", () => {
  const card = source("common/ui/LinkedListCard");
  expect(card).toContain("StyleSheet.absoluteFill");
  expect(card).toContain("<ListCardCoverContent");
  expect(card).toContain("controls={controls}");
  expect(card).toContain("controlsDisabled={controlsDisabled}");
  const cover = source("common/ui/ListCardCoverContent");
  expect(cover).toContain("<ScrollView");
  expect(cover).toContain("horizontal");
  expect(cover).toContain('justifyContent: "flex-end"');
  expect(cover).toContain('pointerEvents={controlsDisabled ? "none" : "auto"}');
  expect(card).toContain('pointerEvents="none"');
  expect(card).toContain('flexWrap: "wrap"');
  expect(card).toContain('alignItems: "center"');
  expect(source("events/EventTableCard")).not.toContain("<HelpPopover");
  for (const path of ["events/TableList", "events/EventDetail"])
    expect(source(path)).toContain("<TableListHeading");
  expect(source("events/TableListHeading")).toContain('t("Table list")');
  expect(source("events/TableListHeading")).toContain('t("Table legend")');
  expect(source("events/EventCardIndicators")).toContain(
    "eventParticipationFlags(event.myRegistrations)",
  );
});
