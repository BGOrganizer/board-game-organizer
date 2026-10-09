import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// Structural regression checks only. Maestro/device acceptance remains separate.
describe("native list component ownership", () => {
  it.each([
    "app/(tabs)/contacts.tsx",
    "app/group/[groupId].tsx",
    "app/match/[matchId].tsx",
    "app/match/search-user.tsx",
    "components/groups/GroupWizard.tsx",
    "components/matches/MatchWizard.tsx",
    "components/organizations/OrganizationMembers.tsx",
    "components/organizations/OrganizationFriendPicker.tsx",
  ])("uses shared user identity in %s", (path) => {
    expect(source(path)).toContain("<UserListRow");
  });
  it.each([
    "components/groups/GroupWizard.tsx",
    "components/matches/MatchWizard.tsx",
    "components/organizations/OrganizationMembers.tsx",
  ])("uses shared invitation placeholder in %s", (path) => {
    expect(source(path)).toContain("<AddUserRow");
  });
  it("keeps user collections virtualized and grouped, with observable errors and explicit page retry", () => {
    const list = source("components/common/ui/UserList.tsx");
    expect(list).toContain("<FlatList");
    expect(list).toContain("<GroupedList>{renderRow(item)}</GroupedList>");
    expect(list).toContain('accessibilityRole="alert"');
    expect(list).toContain("page.isFetchNextPageError");
    expect(list).not.toContain("<ScrollView");
    const members = source("components/organizations/OrganizationMembers.tsx");
    expect(members).toContain("data={canViewPeople ? list.items : []}");
    expect(members).toContain("const managed = canViewPeople");
    expect(members).toContain("organizationMemberActions(organization, managed)");
    expect(members).toContain("managed && managedActions.length > 0");
  });
  it.each([
    "components/games/GamePicker.tsx",
    "components/matches/MatchWizard.tsx",
    "app/match/[matchId].tsx",
  ])("uses shared game row in %s", (path) => {
    expect(source(path)).toContain("<GameListRow");
  });
  it.each([
    "components/organizations/OrganizationWizard.tsx",
    "components/matches/MatchWizard.tsx",
    "app/match/[matchId].tsx",
  ])("uses shared location row in %s", (path) => {
    expect(source(path)).toContain("<LocationListRow");
  });
  it.each([
    "components/organizations/Organizations.tsx",
    "components/groups/GroupsScreen.tsx",
    "app/(tabs)/matches.tsx",
    "components/events/Events.tsx",
    "components/community/CommunityDiscovery.tsx",
  ])("keeps shared card shell/body without moving domain actions in %s", (path) => {
    const content = source(path);
    expect(content).toContain("<LinkedListCard");
    expect(content).toContain("<ListCardBody");
  });
  it.each([
    "components/organizations/OrganizationDetail.tsx",
    "app/group/[groupId].tsx",
    "app/match/[matchId].tsx",
    "app/(tabs)/contacts.tsx",
  ])("uses shared tab spacing in %s", (path) => {
    expect(source(path)).toContain("<TabBar>");
  });
});
