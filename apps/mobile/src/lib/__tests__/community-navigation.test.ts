import { existsSync, readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-device", () => ({ isDevice: false }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-notifications", () => ({}));

import { notificationHref } from "../notifications/push-notifications";

const eventId = "bf5946bb-8845-439e-ae46-d54e059c0e6a",
  tableId = "8b34c2c6-9afe-47e9-bc50-96cab4957376";
describe("community notification destinations", () => {
  it("maps only canonical internal event and table paths", () => {
    expect(notificationHref({ href: "/events" })).toBe("/events");
    expect(notificationHref({ href: `/events/${eventId}` })).toBe(`/event/${eventId}`);
    expect(notificationHref({ href: `/events/${eventId}/tables/${tableId}` })).toBe(
      `/event/table?eventId=${eventId}&tableId=${tableId}`,
    );
  });
  it.each([
    `https://evil.example/events/${eventId}`,
    `//evil.example/events/${eventId}`,
    `/events/${eventId}?next=evil`,
    `/events/${eventId}/`,
    `/events/${eventId}/tables/invalid`,
    `/events/invalid`,
    `/events/${eventId}/tables/${tableId}/`,
    `/events/${eventId}/tables/${tableId}#fragment`,
  ])("rejects noncanonical event path %s", (href) =>
    expect(notificationHref({ href })).toBe("/notifications"),
  );
  it("owns native tabs in route params and exposes unambiguous pressable targets", () => {
    const source = readFileSync(
      new URL("../../components/community/CommunitySection.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("router.setParams({ section })");
    for (const section of ["groups", "organizations", "search"]) {
      expect(source).toContain(`testID="community-tab-${section}"`);
    }
    expect(source).not.toContain("setSelected(params.section)");
  });
  it("keeps the embedded address picker header responsive to the owning screen title", () => {
    const source = readFileSync(
      new URL("../../components/locations/LocationPicker.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("<HeaderTitle title={children} icon={MapPin} />");
    expect(source).not.toContain('headerTitle: () => <HeaderTitle title={t("Select location")}');
  });
  it("returns community edits to the existing detail instead of duplicating its history entry", () => {
    for (const [component, resource] of [
      ["organizations/OrganizationWizard", "organization"],
      ["events/EventWizard", "event"],
    ]) {
      const source = readFileSync(
        new URL(`../../components/${component}.tsx`, import.meta.url),
        "utf8",
      );
      expect(source).toContain("router.dismissTo(`/" + resource + "/${row.id}`)");
      expect(source).not.toContain("router.replace(`/" + resource + "/${row.id}`)");
    }
  });
  it("keeps organization creation accessible and event creation inside its owning organization", () => {
    const organizations = readFileSync(
      new URL("../../components/organizations/Organizations.tsx", import.meta.url),
      "utf8",
    );
    expect(organizations).toContain('testID="new-organization-fab"');
    expect(organizations).toContain("/organization/wizard");
    expect(organizations).toContain("FloatingActions");
    const events = readFileSync(
      new URL("../../components/events/Events.tsx", import.meta.url),
      "utf8",
    );
    expect(events).not.toContain("FloatingActions");
    expect(events).not.toContain("/event/wizard");
    const detail = readFileSync(
      new URL("../../components/organizations/OrganizationDetail.tsx", import.meta.url),
      "utf8",
    );
    expect(detail).toContain('pathname: "/event/wizard", params: { organizationId }');
    expect(detail).toContain('organization?.role === "admin" && tab === "events"');
    expect(detail).toContain('testID="new-organization-event-fab"');
  });
  it("shares native search, icon filters, and page spacing without nested virtual lists", () => {
    for (const file of [
      "groups/GroupsScreen",
      "organizations/Organizations",
      "events/Events",
      "community/CommunityDiscovery",
    ]) {
      const source = readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
      expect(source).toContain("listPageContentStyle");
      expect(source).toContain("<ListPage>");
      expect(source).toContain("<FlatList");
      expect(source).not.toContain("<ScrollView");
      expect(source).toMatch(/<ListSearch(?:Filters)?/);
    }
    const search = readFileSync(
      new URL("../../components/common/ui/ListSearch.tsx", import.meta.url),
      "utf8",
    );
    expect(search).toContain("SearchHelpLabel");
    expect(search).toContain("placeholder={placeholder}");
    expect(search).toContain("{query ? <SearchField.ClearButton");
    expect(search).toContain("accessibilityState={{ selected: active }}");
    const tabs = readFileSync(
      new URL("../../components/community/CommunitySection.tsx", import.meta.url),
      "utf8",
    );
    expect(tabs).toContain("listPageContentStyle");
    const layout = readFileSync(new URL("../../app/(tabs)/_layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain('title={t("Community")}');
  });
  it("keeps the saved group name visible in its dedicated detail header", () => {
    const source = readFileSync(new URL("../../app/group/[groupId].tsx", import.meta.url), "utf8");
    expect(source).toContain('title: group?.name ?? t("Group details")');
  });
  it("shows table errors instead of waiting forever for a disabled dependent query", () => {
    const source = readFileSync(
      new URL("../../components/events/EventTableDetail.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("eq.isPending || (Boolean(event) && tq.isPending)");
    expect(source).toContain("if (event) void tq.refetch()");
  });
  it("resolves static assets after extracting reusable native pickers", () => {
    for (const name of [
      "locations/LocationPicker.tsx",
      "games/GamePicker.tsx",
      "groups/GroupsScreen.tsx",
    ]) {
      const file = new URL(`../../components/${name}`, import.meta.url),
        source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/require\("([^"]+)"\)/g))
        expect(existsSync(new URL(match[1], file)), `${name}: ${match[1]}`).toBe(true);
    }
  });
  it("keeps native permission scope image-only and routes to actual wizard implementations", () => {
    const config = readFileSync(new URL("../../../app.config.js", import.meta.url), "utf8");
    expect(config).toContain('"expo-image-picker"');
    expect(config).toContain("microphonePermission: false");
    for (const [route, component] of [
      ["../../app/event/wizard.tsx", "EventWizard"],
      ["../../app/organization/wizard.tsx", "OrganizationWizard"],
      ["../../app/match/search-game.tsx", "GamePicker"],
      ["../../app/match/search-location.tsx", "LocationPicker"],
    ]) {
      const source = readFileSync(new URL(route, import.meta.url), "utf8");
      expect(source).toContain(component);
    }
  });
});
