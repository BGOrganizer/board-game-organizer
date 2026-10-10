import { useLocalSearchParams } from "expo-router";
import { Events } from "@/components/events/Events";
export default function EventsScreen() {
  const { organizationId } = useLocalSearchParams<{ organizationId?: string }>();
  return <Events organizationId={organizationId} />;
}
