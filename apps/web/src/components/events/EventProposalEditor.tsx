"use client";
import { useEventProposalEditor, useFavoriteLocations } from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { SearchGamePage } from "@/components/games/SearchGamePage";
import { SearchLocationPage } from "@/components/locations/SearchLocationPage";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function EventProposalEditor({
  eventId,
  kind,
  tableId,
  draftId,
}: {
  eventId: string;
  kind: string;
  tableId?: string;
  draftId?: string;
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    router = useRouter();
  const form = useEventProposalEditor(o, eventId, kind, tableId, draftId);
  const favorites = useFavoriteLocations(
    { ...o, userId: form.allowed && kind === "location" ? o.userId : undefined },
    form.event?.locations ?? [],
  );
  if (form.allowed && kind === "game")
    return (
      <SearchGamePage
        apiUrl={o.apiUrl}
        token={null}
        getToken={o.getToken}
        userId={o.userId}
        protectionBypass={o.protectionBypass ?? undefined}
        proposalScope={{ eventId, tableId: tableId ?? "" }}
        excludeIds={form.table.data?.games.map((g) => g.gameId)}
        onClose={() => router.back()}
        onSelect={(game) => {
          if (form.submit({ kind: "game", tableId: tableId ?? "", gameId: game.id }, game.name))
            router.back();
        }}
      />
    );
  if (form.allowed && kind === "location")
    return (
      <SearchLocationPage
        apiUrl={o.apiUrl}
        getToken={o.getToken}
        userId={o.userId}
        protectionBypass={o.protectionBypass ?? undefined}
        favorites={favorites}
        initial={form.payload?.kind === "location" ? form.payload.location : undefined}
        onClose={() => router.back()}
        onSelect={(location) => {
          if (form.submit({ kind: "location", location }, location.name)) router.back();
        }}
      />
    );
  return (
    <div className="mx-auto max-w-3xl space-y-5 py-8">
      <h1 className="text-xl font-semibold">{t`Choose date and time`}</h1>
      {form.validInput && (form.q.isPending || (kind === "game" && form.table.isPending)) ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !form.allowed ? (
        <>
          <p
            role="alert"
            className="text-danger"
          >{t`Proposals require an enabled category and your own seated participation in a private planning event.`}</p>
          {form.q.isError || form.table.isError ? (
            <Button
              onPress={() => {
                void form.q.refetch();
                if (kind === "game") void form.table.refetch();
              }}
            >{t`Try again`}</Button>
          ) : null}
        </>
      ) : (
        <>
          <TextField
            value={
              form.payload?.kind === "date" ? `${form.payload.day}T${form.payload.startTime}` : ""
            }
            onChange={form.chooseDate}
          >
            <Label>{t`Choose date and time`}</Label>
            <Input name="proposedDateTime" autoComplete="off" type="datetime-local" step={60} />
          </TextField>
          <Button
            isDisabled={!form.canSubmit}
            onPress={() => {
              if (form.submit()) router.back();
            }}
          >{t`Send proposal`}</Button>
        </>
      )}
      <Button variant="ghost" onPress={() => router.back()}>{t`Cancel`}</Button>
    </div>
  );
}
