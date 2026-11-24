import { measureRenders } from "@callstack/reassure-measure";
import { screen, within } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { expect, it, vi } from "vitest";
import MatchesTab from "@/app/(tabs)/matches";
import OrganizationsTab from "@/app/(tabs)/organizations";
import MatchDetails from "@/app/match/[matchId]";
import MatchResults from "@/app/match/results";
import MatchGameSearch from "@/app/match/search-game";
import MatchLocationSearch from "@/app/match/search-location";
import MatchUserSearch from "@/app/match/search-user";
import MatchWizard from "@/app/match/wizard";
import OrganizationDetails from "@/app/organization/[organizationId]";
import OrganizationInvite from "@/app/organization/invite";
import OrganizationWizard from "@/app/organization/wizard";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

// Observe the Expo SDK destination while mounting each actual legacy entry.
vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => <Text testID="sdk-redirect-target">{href}</Text>,
}));

it("Legacy mobile routes: resolve retired match and organization entries declaratively", async () => {
  const result = await measureRenders(
    <>
      <View testID="match-entries">
        <MatchesTab />
        <MatchDetails />
        <MatchResults />
        <MatchGameSearch />
        <MatchLocationSearch />
        <MatchUserSearch />
        <MatchWizard />
      </View>
      <View testID="organization-entries">
        <OrganizationsTab />
        <OrganizationDetails />
        <OrganizationInvite />
        <OrganizationWizard />
      </View>
    </>,
    {
      scenario: async () => {
        const matches = within(screen.getByTestId("match-entries")).getAllByTestId(
          "sdk-redirect-target",
        );
        const organizations = within(screen.getByTestId("organization-entries")).getAllByTestId(
          "sdk-redirect-target",
        );
        expect(matches).toHaveLength(7);
        expect(organizations).toHaveLength(4);
        for (const match of matches) expect(match).toHaveTextContent(/^\/tables$/);
        for (const organization of organizations)
          expect(organization).toHaveTextContent(/^\/groups$/);
      },
    },
  );
  assertRenderMeasurement(result);
});
