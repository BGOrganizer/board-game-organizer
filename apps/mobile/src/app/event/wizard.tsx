import { useLocalSearchParams } from "expo-router";
import { EventWizard } from "@/components/EventWizard";
export default function WizardScreen() {
  const { eventId, organizationId } = useLocalSearchParams<{
    eventId?: string;
    organizationId?: string;
  }>();
  return <EventWizard eventId={eventId} organizationId={organizationId} />;
}
