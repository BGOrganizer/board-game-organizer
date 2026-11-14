import { useLocalSearchParams } from "expo-router";
import { EventProposalEditor } from "@/components/events/EventProposalEditor";
export default function Screen() {
  const p = useLocalSearchParams<{
    eventId?: string;
    kind?: string;
    tableId?: string;
    draftId?: string;
  }>();
  return (
    <EventProposalEditor
      eventId={p.eventId ?? ""}
      kind={p.kind ?? ""}
      tableId={p.tableId}
      draftId={p.draftId}
    />
  );
}
