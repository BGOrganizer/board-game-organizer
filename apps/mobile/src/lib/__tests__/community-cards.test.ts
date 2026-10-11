// Source contracts only; native layout, SVG and dialog acceptance belongs to Maestro/device runs.
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(new URL(`../../components/${file}`, import.meta.url), "utf8");
it("uses locally generated planets, explicit left artwork, semantic status and authoritative event metadata", () => {
  const card = source("events/EventCard.tsx");
  expect(card).toContain('<AnimatedDicebearArtwork seed={event.id} variant="planets"');
  const artwork = source("common/ui/AnimatedDicebearArtwork.tsx");
  expect(artwork).toContain("@dicebear/styles/planets.json");
  expect(artwork).toContain("SvgXml");
  expect(artwork).toContain("useReducedMotion");
  expect(artwork).toContain("ReduceMotion.System");
  expect(artwork).toContain("cancelAnimation(shift)");
  expect(card).toContain("LinkedListCard");
  expect(card).toContain("event.organizationApproved");
  expect(card).toContain("event.confirmedParticipantCount");
  expect(card).toContain("event.tableCount");
  expect(card).toContain("timeZone: event.timeZone");
  expect(card).toContain("i18n.locale");
  for (const icon of [
    "BadgeCheck",
    "CalendarDays",
    "CalendarRange",
    "Clock3",
    "MapPin",
    "LayoutGrid",
    "UsersRound",
  ])
    expect(card).toContain(icon);
  expect(card).toContain('position: "absolute"');
  expect(card).toContain('"warning"');
  expect(card).toContain('"success"');
  expect(artwork).toContain("width: size, height: size");
});
it("composes shared card frames, total organization counts and contextual header/footer actions", () => {
  const detail = source("organizations/OrganizationDetail.tsx"),
    card = source("organizations/OrganizationDetailsCard.tsx");
  expect(card).toContain("<ListCard>");
  expect(source("common/ui/LinkedListCard.tsx")).toContain("<ListCard>");
  expect(source("common/ui/ListCard.tsx")).toContain("padding: 0");
  expect(card).toContain("organization.publishedEventCount");
  expect(card).toContain("organization.memberCount");
  expect(card).toContain('justifyContent: "flex-end"');
  expect(detail).toContain('testID="leave-organization-header"');
  expect(detail).toContain('presentation="choices"');
  expect(detail).toContain('organization.role !== "accepted"');
  expect(detail).toContain("isIconOnly");
  expect(detail).toContain(
    "accessibilityLabel={t(organizationActionLabel(action, organization.role))}",
  );
  expect(source("organizations/OrganizationInvitationResponse.tsx")).toContain(
    'setChoice("decline")',
  );
});
it("reuses centered, full-width empty states without replacing loading/error guards", () => {
  const empty = source("common/ui/EmptyList.tsx");
  expect(empty).toContain('width: "100%"');
  expect(empty).toContain('alignItems: "center"');
  for (const file of [
    "events/Events.tsx",
    "events/EventDetail.tsx",
    "games/GamePicker.tsx",
    "locations/LocationPicker.tsx",
    "community/CommunityDiscovery.tsx",
    "notifications/NotificationBell.tsx",
  ]) {
    expect(source(file)).toContain("<EmptyList");
    expect(source(file)).toContain("isError");
    expect(source(file)).toContain("isPending");
  }
});
