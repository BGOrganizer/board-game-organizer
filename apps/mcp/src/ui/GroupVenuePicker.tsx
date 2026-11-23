import { type MatchLocation, matchLocationSchema } from "@board-game-organizer/schemas";
import { formatLocationAddress, withClientRequestId } from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { App } from "@modelcontextprotocol/ext-apps";
import { MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { callTool } from "./protocol";

const candidate = matchLocationSchema
  .omit({ id: true, name: true })
  .extend({ id: z.string().min(1) });
const locationsResult = z.object({ items: z.array(candidate) });
type LocationCandidate = z.infer<typeof candidate>;

export function GroupVenuePicker({
  app,
  value,
  onChange,
  required,
  disabled,
}: {
  app: App;
  value: MatchLocation | null;
  onChange: (value: MatchLocation | null) => void;
  required: boolean;
  disabled: boolean;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<{ query: string; items: LocationCandidate[] } | null>(
    null,
  );
  const [failedQuery, setFailedQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const normalizedQuery = query.trim();
  const searching = !value && normalizedQuery.length >= 4;
  const choices = searching && response?.query === normalizedQuery ? response.items : null;
  const failed = searching && failedQuery === normalizedQuery;

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timeout = setTimeout(
      async () => {
        try {
          const data = locationsResult.parse(
            await callTool(
              app,
              "search_locations",
              { query: { query: normalizedQuery } },
              controller.signal,
            ),
          );
          if (!controller.signal.aborted)
            setResponse({ query: normalizedQuery, items: data.items });
        } catch {
          if (!controller.signal.aborted) setFailedQuery(normalizedQuery);
        }
      },
      retry ? 0 : 300,
    );
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [app, normalizedQuery, searching, retry]);

  function updateQuery(next: string) {
    setQuery(next);
    setRetry(0);
    setResponse(null);
    setFailedQuery("");
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          <TextField
            value={value.name}
            onChange={(name) => onChange({ ...value, name })}
            isDisabled={disabled}
            isRequired
          >
            <Label>{t`Location name`}</Label>
            <Input maxLength={120} autoComplete="off" />
          </TextField>
          <GroupedList>
            <LocationListRow
              name={value.name}
              address={value.address}
              actions={
                <Button
                  size="sm"
                  isIconOnly
                  variant="ghost"
                  type="button"
                  isDisabled={disabled}
                  aria-label={t`Remove location`}
                  onPress={() => onChange(null)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              }
            />
          </GroupedList>
        </div>
      ) : (
        <TextField value={query} onChange={updateQuery} isDisabled={disabled}>
          <Label>
            {t`Group venue`}
            {required ? (
              <span aria-hidden className="text-danger">
                {" "}
                *
              </span>
            ) : null}
          </Label>
          <div className="flex items-center gap-2">
            <Input autoComplete="off" maxLength={200} placeholder={t`Search address`} />
            {query ? (
              <Button
                size="sm"
                isIconOnly
                variant="ghost"
                type="button"
                isDisabled={disabled}
                aria-label={t`Clear search`}
                onPress={() => updateQuery("")}
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        </TextField>
      )}
      {choices?.length ? (
        <GroupedList>
          {choices.map((choice) => (
            <LocationListRow
              key={choice.id}
              name={formatLocationAddress(choice.address)}
              label={choice.address}
              onPress={() => {
                if (disabled) return;
                const { clientRequestId: id } = withClientRequestId({ clientRequestId: "" });
                const addressName = formatLocationAddress(choice.address).slice(0, 120);
                updateQuery("");
                onChange({ ...choice, id, name: addressName.length >= 4 ? addressName : "" });
              }}
            />
          ))}
        </GroupedList>
      ) : null}
      {choices && !choices.length ? (
        <EmptyList icon={<MapPin className="size-7" />}>{t`No addresses found`}</EmptyList>
      ) : null}
      {failed ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-danger">{t`Something went wrong`}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPress={() => {
              setFailedQuery("");
              setRetry((previous) => previous + 1);
            }}
          >{t`Try again`}</Button>
        </div>
      ) : null}
      {searching && !failed && !choices ? (
        <Skeleton aria-label={t`Loading…`} className="h-10 w-full rounded-xl" />
      ) : null}
    </div>
  );
}
