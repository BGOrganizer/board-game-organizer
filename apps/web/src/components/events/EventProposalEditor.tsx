"use client";
import {
  eventProposalLabel,
  useEventProposalEditor,
  useFavoriteLocations,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const { t, i18n } = useLingui(),
    o = useCommunityApi(),
    router = useRouter(),
    form = useEventProposalEditor(o, eventId, kind, tableId, draftId);
  const identity = `${o.apiUrl}|${o.userId}|${eventId}|${kind}|${tableId ?? ""}|${draftId ?? ""}`;
  const [pickerOwner, setPickerOwner] = useState<string | null>(null);
  const pick = pickerOwner === identity && form.allowed;
  const setPick = (open: boolean) => setPickerOwner(open ? identity : null);
  useEffect(() => {
    if (!form.allowed) setPickerOwner(null);
  }, [form.allowed]);
  const favorites = useFavoriteLocations(
    {
      ...o,
      userId:
        o.enabled !== false && pick && kind === "location" && form.allowed ? o.userId : undefined,
    },
    form.event?.locations ?? [],
  );
  if (pick && form.allowed && kind === "game")
    return (
      <SearchGamePage
        apiUrl={o.apiUrl}
        token={null}
        getToken={o.getToken}
        userId={o.userId}
        protectionBypass={o.protectionBypass ?? undefined}
        excludeIds={form.table.data?.games.map((g) => g.gameId)}
        onClose={() => setPick(false)}
        onSelect={(game) => {
          form.chooseGame(game);
          setPick(false);
        }}
      />
    );
  if (pick && form.allowed && kind === "location")
    return (
      <SearchLocationPage
        apiUrl={o.apiUrl}
        getToken={o.getToken}
        userId={o.userId}
        protectionBypass={o.protectionBypass ?? undefined}
        favorites={favorites}
        onClose={() => setPick(false)}
        onSelect={(location) => {
          form.chooseLocation(location);
          setPick(false);
        }}
      />
    );
  return (
    <div className="mx-auto max-w-3xl space-y-5 py-8">
      <h1 className="text-xl font-semibold">
        {kind === "date"
          ? t`Propose a date and time`
          : kind === "location"
            ? t`Propose a location`
            : t`Propose a game`}
      </h1>
      {form.validInput && form.q.isPending ? (
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
          <p>{t`Submit explicitly. Your proposal stays private until managers approve its option.`}</p>
          {kind === "date" ? (
            <TextField
              value={
                form.payload?.kind === "date" ? `${form.payload.day}T${form.payload.startTime}` : ""
              }
              onChange={form.chooseDate}
            >
              <Label>{t`Choose date and time`}</Label>
              <Input name="proposedDateTime" autoComplete="off" type="datetime-local" step={60} />
            </TextField>
          ) : (
            <Button variant="outline" onPress={() => setPick(true)}>
              {kind === "game" ? t`Choose a game` : t`Choose a verified address`}
            </Button>
          )}
          {form.label ? (
            <p role="status">
              {form.payload
                ? eventProposalLabel(form.payload, form.label, i18n.locale)
                : form.label}
            </p>
          ) : null}
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
