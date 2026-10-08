import { existsSync, readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-device", () => ({ isDevice: false }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-notifications", () => ({}));

import { notificationHref } from "../push-notifications";

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
      new URL("../../components/CommunitySection.tsx", import.meta.url),
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
      new URL("../../components/LocationPicker.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("<HeaderTitle title={children} icon={MapPin} />");
    expect(source).not.toContain('headerTitle: () => <HeaderTitle title={t("Select location")}');
  });
  it("returns community edits to the existing detail instead of duplicating its history entry", () => {
    for (const [component, resource] of [
      ["OrganizationWizard", "organization"],
      ["EventWizard", "event"],
    ]) {
      const source = readFileSync(
        new URL(`../../components/${component}.tsx`, import.meta.url),
        "utf8",
      );
      expect(source).toContain("router.dismissTo(`/" + resource + "/${row.id}`)");
      expect(source).not.toContain("router.replace(`/" + resource + "/${row.id}`)");
    }
  });
  it("exposes accessible creation actions in both native community lists", () => {
    for (const [component, testId, route] of [
      ["Organizations", "new-organization-fab", "/organization/wizard"],
      ["Events", "new-event-fab", "/event/wizard"],
    ]) {
      const source = readFileSync(
        new URL(`../../components/${component}.tsx`, import.meta.url),
        "utf8",
      );
      expect(source).toContain(`testID="${testId}"`);
      expect(source).toContain(route);
      expect(source).toContain("FloatingActions");
    }
  });
  it("keeps the saved group name visible in its dedicated detail header", () => {
    const source = readFileSync(new URL("../../app/group/[groupId].tsx", import.meta.url), "utf8");
    expect(source).toContain('title: group?.name ?? t("Group details")');
  });
  it("shows table errors instead of waiting forever for a disabled dependent query", () => {
    const source = readFileSync(new URL("../../components/Events.tsx", import.meta.url), "utf8");
    expect(source).toContain("eq.isPending || (Boolean(event) && tq.isPending)");
    expect(source).toContain("if (event) void tq.refetch()");
  });
  it("resolves static assets after extracting reusable native pickers", () => {
    for (const name of ["LocationPicker.tsx", "GamePicker.tsx", "Groups.tsx"]) {
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
