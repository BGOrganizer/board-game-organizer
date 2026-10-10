import { useLocalSearchParams } from "expo-router";
import { OrganizationWizard } from "@/components/organizations/OrganizationWizard";
export default function WizardScreen() {
  const { organizationId } = useLocalSearchParams<{ organizationId?: string }>();
  return <OrganizationWizard organizationId={organizationId} />;
}
