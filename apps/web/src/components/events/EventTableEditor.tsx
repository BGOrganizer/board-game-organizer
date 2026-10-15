"use client";
import type { EventTableInput } from "@board-game-organizer/schemas";
import {
  type EventDraftTable,
  type EventFormErrors,
  eventDateLimit,
  eventLocalDateTime,
  eventPlayerRange,
  eventTableForm,
} from "@board-game-organizer/shared";
import { Avatar, Button, FieldError, Input, Label, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  ClipboardList,
  Gamepad2,
  Minus,
  Plus,
  Save,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchGamePage } from "@/components/games/SearchGamePage";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventDateTimeField } from "./EventDateTimeField";
import { EventDemonstratorPicker } from "./EventDemonstratorPicker";

export function EventTableEditor({
  draft,
  timeZone,
  eventStart,
  eventEnd,
  organizationId,
  busy = false,
  onSave,
  onClose,
}: {
  draft: EventDraftTable;
  timeZone: string;
  eventStart: string;
  eventEnd: string;
  organizationId: string;
  busy?: boolean;
  onSave: (table: EventDraftTable) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useLingui();
  const o = useCommunityApi();
  const [value, setValue] = useState(draft);
  const [start, setStart] = useState(
    eventLocalDateTime(draft.input.startsAt, timeZone).slice(0, 16),
  );
  const [end, setEnd] = useState(eventLocalDateTime(draft.input.endsAt, timeZone).slice(0, 16));
  const [pickGame, setPickGame] = useState(false);
  const [pickDemo, setPickDemo] = useState(false);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const patch = (next: Partial<EventTableInput>) =>
    setValue((row) => ({ ...row, input: { ...row.input, ...next } }));
  const error = (field: string) =>
    errors[field] ? (
      <p role="alert" className="text-sm text-danger">
        {i18n._(errors[field])}
      </p>
    ) : null;
  const min = eventDateLimit(
    eventLocalDateTime(eventStart, timeZone).slice(0, 16),
    timeZone,
    "after",
    eventStart,
  );
  const max = eventDateLimit(
    eventLocalDateTime(eventEnd, timeZone).slice(0, 16),
    timeZone,
    "before",
    eventEnd,
  );
  const tableEndMin = eventDateLimit(start, timeZone, "after", value.input.startsAt);
  const endMin = min && tableEndMin ? (min > tableEndMin ? min : tableEndMin) : min;
  const lastStart = max ? eventDateLimit(max, timeZone, "before") : undefined;
  const beforeEnd = eventDateLimit(end, timeZone, "before", value.input.endsAt);
  const startMax =
    beforeEnd && lastStart ? (beforeEnd < lastStart ? beforeEnd : lastStart) : lastStart;
  const day = eventLocalDateTime(eventStart, timeZone).slice(0, 10);
  if (pickGame)
    return (
      <SearchGamePage
        {...o}
        token={null}
        onClose={() => setPickGame(false)}
        onSelect={(game) => {
          setValue((row) => ({
            ...row,
            gameName: game.name,
            imageUrl: game.imageUrl,
            input: { ...row.input, gameId: game.id },
          }));
          setPickGame(false);
        }}
      />
    );
  if (pickDemo)
    return (
      <EventDemonstratorPicker
        organizationId={organizationId}
        onClose={() => setPickDemo(false)}
        onSelect={(member) => {
          setValue((row) => ({
            ...row,
            demonstrator: member,
            input: { ...row.input, demonstratorUserId: member.userId },
          }));
          setPickDemo(false);
        }}
      />
    );
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 pb-32">
      <header className="flex items-center gap-3">
        <Button isIconOnly variant="secondary" aria-label={t`Back`} onPress={onClose}>
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <h1>{t`Configure table`}</h1>
      </header>
      <TextField
        value={value.input.name}
        onChange={(name) => patch({ name })}
        isInvalid={Boolean(errors.name)}
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="size-5 text-default-500" aria-hidden />
          <SearchHelpLabel
            label={t`Table name`}
            htmlFor="table-name"
            helpTitle={t`Field help`}
            help={t`Give this table a recognizable name (1–120 characters).`}
          />
        </div>
        <Input id="table-name" aria-label={t`Table name`} maxLength={120} />
        <FieldError>
          <span role="alert">{errors.name ? i18n._(errors.name) : null}</span>
        </FieldError>
      </TextField>
      <EventDateTimeField
        label={t`Start time`}
        mode="time"
        day={day}
        value={start}
        min={min}
        max={startMax}
        error={errors.startsAt ? i18n._(errors.startsAt) : undefined}
        onChange={setStart}
      />
      <EventDateTimeField
        label={t`End time`}
        mode="time"
        day={day}
        value={end}
        min={endMin}
        max={max}
        error={errors.endsAt ? i18n._(errors.endsAt) : undefined}
        onChange={setEnd}
      />
      <div className="flex flex-wrap gap-6">
        {(["minPlayers", "maxPlayers"] as const).map((field) => (
          <div key={field} className="space-y-1">
            <Label>{field === "minPlayers" ? t`Minimum players` : t`Maximum players`}</Label>
            <div className="flex items-center gap-3">
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                aria-label={
                  field === "minPlayers" ? t`Decrease min players` : t`Decrease max players`
                }
                isDisabled={
                  field === "minPlayers"
                    ? value.input.minPlayers <= 2
                    : value.input.maxPlayers <= value.input.minPlayers
                }
                onPress={() =>
                  patch(eventPlayerRange(value.input.minPlayers, value.input.maxPlayers, field, -1))
                }
              >
                <Minus className="size-4" aria-hidden />
              </Button>
              <output
                className="min-w-8 text-center font-bold"
                aria-label={field === "minPlayers" ? t`Minimum players` : t`Maximum players`}
              >
                {value.input[field]}
              </output>
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                aria-label={
                  field === "minPlayers" ? t`Increase min players` : t`Increase max players`
                }
                onPress={() =>
                  patch(eventPlayerRange(value.input.minPlayers, value.input.maxPlayers, field, 1))
                }
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </div>
            {error(field)}
          </div>
        ))}
      </div>
      <Label>{t`Board game`}</Label>
      <GroupedList>
        <GroupedRow>
          <Button
            variant="ghost"
            className="h-auto min-h-11 min-w-0 flex-1 justify-start"
            onPress={() => setPickGame(true)}
            aria-label={value.gameName || t`Select a board game`}
          >
            {value.imageUrl ? (
              <Avatar className="rounded-lg">
                <Avatar.Image src={value.imageUrl} alt="" className="object-contain" />
              </Avatar>
            ) : (
              <Gamepad2 className="size-5 text-default-500" aria-hidden />
            )}
            <span className="truncate">{value.gameName || t`Select a board game`}</span>
          </Button>
          {value.input.gameId > 0 ? (
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              aria-label={t`Remove game`}
              onPress={() =>
                setValue((row) => ({
                  ...row,
                  gameName: "",
                  imageUrl: undefined,
                  input: { ...row.input, gameId: 0 },
                }))
              }
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          ) : null}
        </GroupedRow>
      </GroupedList>
      {error("gameId")}
      <SearchHelpLabel
        label={t`Demonstrator`}
        helpTitle={t`Field help`}
        help={t`Optional: choose a confirmed organization member. They can record this table's results but do not automatically reserve a player seat.`}
      />
      <GroupedList>
        <GroupedRow>
          <Button
            variant="ghost"
            className="h-auto min-h-11 min-w-0 flex-1 justify-start"
            aria-label={t`Choose demonstrator`}
            onPress={() => setPickDemo(true)}
          >
            {value.demonstrator ? (
              <Avatar size="md">
                <Avatar.Image src={value.demonstrator.avatarUrl ?? undefined} alt="" />
                <Avatar.Fallback>
                  {(value.demonstrator.name ?? value.demonstrator.username ?? "?").charAt(0)}
                </Avatar.Fallback>
              </Avatar>
            ) : (
              <UsersRound className="size-5 text-default-500" aria-hidden />
            )}
            <span className="truncate">
              {value.demonstrator?.name ??
                value.demonstrator?.username ??
                (value.input.demonstratorUserId
                  ? t`Selected demonstrator`
                  : t`Choose demonstrator`)}
            </span>
          </Button>
          {value.input.demonstratorUserId ? (
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              aria-label={t`Remove demonstrator`}
              onPress={() =>
                setValue((row) => ({
                  ...row,
                  demonstrator: undefined,
                  input: { ...row.input, demonstratorUserId: undefined },
                }))
              }
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          ) : null}
        </GroupedRow>
      </GroupedList>
      {error("demonstratorUserId")}
      <Switch isSelected={value.input.openSkill} onChange={(openSkill) => patch({ openSkill })}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>
          <Label>{t`Global ratings enabled`}</Label>
        </Switch.Content>
      </Switch>
      <Button
        className="w-fit self-end"
        isDisabled={busy}
        onPress={() => {
          if (busy) return;
          const result = eventTableForm({
            input: value.input,
            start,
            end,
            zone: timeZone,
            eventStart,
            eventEnd,
          });
          setErrors(result.errors);
          if (result.data) onSave({ ...value, input: result.data });
        }}
      >
        <Save className="size-4" aria-hidden />
        {t`Save table`}
      </Button>
    </section>
  );
}
