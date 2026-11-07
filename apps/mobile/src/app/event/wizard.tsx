import { useLocalSearchParams } from "expo-router";
import { EventWizard } from "@/components/events/EventWizard";
export default function Screen() {
  const p = useLocalSearchParams<{
    eventId?: string;
    groupId?: string;
    draftId?: string;
    fromGroup?: string;
  }>();
  return (
    <EventWizard
      eventId={p.eventId}
      groupId={p.groupId}
      draftId={p.draftId}
      fromGroup={p.fromGroup}
    />
  );
}
