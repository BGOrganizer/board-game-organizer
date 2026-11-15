import { EventProposalEditor } from "@/components/events/EventProposalEditor";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    kind?: string | string[];
    tableId?: string | string[];
    draftId?: string | string[];
  }>;
}) {
  const [{ eventId }, search] = await Promise.all([params, searchParams]);
  return (
    <EventProposalEditor
      eventId={eventId}
      kind={typeof search.kind === "string" ? search.kind : ""}
      tableId={typeof search.tableId === "string" ? search.tableId : undefined}
      draftId={typeof search.draftId === "string" ? search.draftId : undefined}
    />
  );
}
