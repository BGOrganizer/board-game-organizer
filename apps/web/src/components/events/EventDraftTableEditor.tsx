"use client";
import {
  DEFAULT_GAME_DURATION_MINUTES,
  type EventTableDraft,
  eventGameDuration,
  gamePlayerBounds,
  publicTableTimeBounds,
} from "@board-game-organizer/shared";
import { Button, Input, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Minus, Plus, Trash2, UserRoundPen, UserRoundPlus, X } from "lucide-react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { NameInput } from "@/components/common/ui/NameInput";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { GameListRow } from "@/components/games/GameListRow";

export function EventDraftTableEditor({
  row,
  publicGroup,
  privateGroup = false,
  eventStartWall = "",
  eventEndWall = "",
  busy,
  fieldError = () => false,
  onChange,
  onRemove,
  onGame,
  onDemonstrator,
}: {
  row: EventTableDraft;
  publicGroup: boolean;
  privateGroup?: boolean;
  eventStartWall?: string;
  eventEndWall?: string;
  busy: boolean;
  fieldError?: (path: string) => boolean;
  onChange: (value: Partial<EventTableDraft>) => void;
  onRemove: () => void;
  onGame: () => void;
  onDemonstrator: () => void;
}) {
  const { t, i18n } = useLingui();
  const day = eventStartWall.slice(0, 10);
  const playerBounds = gamePlayerBounds(row.games);
  const bounds = publicTableTimeBounds(
    eventStartWall,
    eventEndWall,
    row.games.length
      ? Math.max(...row.games.map(eventGameDuration))
      : DEFAULT_GAME_DURATION_MINUTES,
  );
  const helpTitle = t`Field help`;
  const information = (
    <>
      <TextField
        value={row.name}
        onChange={(name) => onChange({ name })}
        isRequired
        isDisabled={busy}
        isInvalid={fieldError("name")}
      >
        <SearchHelpLabel
          required
          label={t`Table name`}
          helpTitle={helpTitle}
          help={t`Name this table so players can recognize it. Use between 1 and 120 characters.`}
        />
        <NameInput
          category="tavolo"
          onGenerate={(name) => onChange({ name })}
          isDisabled={busy}
          placeholder={t`Strategy table`}
          maxLength={120}
        />
        {fieldError("name") ? (
          <p
            role="alert"
            className="text-sm text-danger"
          >{t`Enter a table name between 1 and 120 characters.`}</p>
        ) : null}
      </TextField>
      <fieldset
        data-form-field
        data-form-error={fieldError("minPlayers") || fieldError("maxPlayers") || undefined}
        className="space-y-2"
        aria-label={t`Number of players`}
      >
        <SearchHelpLabel
          required
          label={t`Number of players`}
          helpTitle={helpTitle}
          help={t`Choose the minimum on the left and maximum on the right. At least two players are required, and the minimum cannot exceed the maximum.`}
        />
        <div className="flex gap-4">
          <PlayerCount
            label={t`Minimum players`}
            value={row.minPlayers}
            min={Math.max(2, playerBounds?.minPlayers ?? 2)}
            max={Math.min(row.maxPlayers, playerBounds?.maxPlayers ?? row.maxPlayers)}
            busy={busy}
            onChange={(minPlayers) => onChange({ minPlayers })}
          />
          <PlayerCount
            label={t`Maximum players`}
            value={row.maxPlayers}
            min={Math.max(row.minPlayers, playerBounds?.minPlayers ?? 2)}
            max={playerBounds?.maxPlayers ?? Number.MAX_SAFE_INTEGER}
            busy={busy}
            onChange={(maxPlayers) => onChange({ maxPlayers })}
          />
        </div>
      </fieldset>
      {playerBounds ? (
        <p className="text-sm text-muted">
          {t`BoardGameGeek player limits`}: {playerBounds.minPlayers}–{playerBounds.maxPlayers}
        </p>
      ) : null}
      {fieldError("minPlayers") || fieldError("maxPlayers") ? (
        <p
          role="alert"
          className="text-sm text-danger"
        >{t`Choose valid player counts within the limits of the selected games.`}</p>
      ) : null}
    </>
  );
  const options = (
    <>
      <div className="flex items-center justify-between gap-3">
        <SearchHelpLabel
          label={t`Enable ratings`}
          helpTitle={helpTitle}
          help={t`Rated tables update player ratings after final results. At least two players must have a score.`}
        />
        <Switch
          aria-label={t`Enable ratings`}
          isSelected={row.rankingEnabled}
          onChange={(rankingEnabled) => onChange({ rankingEnabled })}
          isDisabled={busy}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </div>
      {privateGroup ? (
        <div className="flex items-center justify-between gap-3">
          <SearchHelpLabel
            label={t`Allow game proposals`}
            helpTitle={helpTitle}
            help={t`Only seated players may propose games for this table. Proposals are reviewed before they become options.`}
          />
          <Switch
            aria-label={t`Allow game proposals`}
            isSelected={Boolean(row.allowParticipantGames)}
            isDisabled={busy}
            onChange={(allowParticipantGames) => onChange({ allowParticipantGames })}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
      ) : null}
    </>
  );
  const scheduleAndGames = (
    <>
      {publicGroup ? (
        <>
          <TextField
            value={row.startsWall.slice(11, 16)}
            onChange={(time) => {
              const startsWall = `${day}T${time}`;
              if (
                !time ||
                (bounds.min && bounds.max && startsWall >= bounds.min && startsWall <= bounds.max)
              )
                onChange({ startsWall: time ? startsWall : "" });
            }}
            isRequired
            isDisabled={busy || !bounds.min || !bounds.max || bounds.min > bounds.max}
            isInvalid={fieldError("startsAt")}
          >
            <SearchHelpLabel
              required
              label={t`Table start`}
              helpTitle={helpTitle}
              help={t`The date is fixed to the event day. Choose a time at or after the event starts; the whole table must finish by the event end.`}
            />
            {day ? (
              <p className="text-sm text-muted">
                {new Intl.DateTimeFormat(i18n.locale, {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(new Date(`${day}T00:00Z`))}
              </p>
            ) : null}
            <Input
              type="time"
              name="tableStart"
              autoComplete="off"
              min={bounds.min?.slice(11, 16)}
              max={bounds.max?.slice(11, 16)}
            />
            {fieldError("startsAt") ? (
              <p
                role="alert"
                className="text-sm text-danger"
              >{t`Choose a table start and duration within the event.`}</p>
            ) : null}
          </TextField>
          <div
            data-form-field
            data-form-error={fieldError("demonstratorUserId") || undefined}
            className="space-y-2"
          >
            <SearchHelpLabel
              label={t`Demonstrator`}
              helpTitle={helpTitle}
              help={t`Optionally assign an accepted group member to demonstrate this public table. Their other tables must not overlap.`}
            />
            <GroupedList>
              <GroupedRow>
                {row.demonstratorUserId ? (
                  <UserIdentity
                    name={row.demonstratorName ?? t`Unknown`}
                    avatarUrl={row.demonstratorAvatarUrl}
                  />
                ) : (
                  <UserRoundPlus className="size-8 text-muted" aria-hidden />
                )}
                <Button
                  isIconOnly={Boolean(row.demonstratorUserId)}
                  variant="ghost"
                  className={
                    row.demonstratorUserId ? "min-h-11 min-w-11" : "min-h-11 flex-1 justify-start"
                  }
                  data-form-control
                  aria-label={t`Choose demonstrator`}
                  isDisabled={busy}
                  onPress={onDemonstrator}
                >
                  {row.demonstratorUserId ? (
                    <UserRoundPen className="size-4" aria-hidden />
                  ) : (
                    t`Choose demonstrator`
                  )}
                </Button>
                {row.demonstratorUserId ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    aria-label={t`Remove demonstrator`}
                    isDisabled={busy}
                    onPress={() =>
                      onChange({
                        demonstratorUserId: undefined,
                        demonstratorName: undefined,
                        demonstratorAvatarUrl: undefined,
                      })
                    }
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </GroupedRow>
            </GroupedList>
            {fieldError("demonstratorUserId") ? (
              <p
                role="alert"
                className="text-sm text-danger"
              >{t`Choose an available group demonstrator.`}</p>
            ) : null}
          </div>
        </>
      ) : null}
      <section
        data-form-field
        data-form-error={fieldError("games") || undefined}
        className="space-y-2"
      >
        <SearchHelpLabel
          required
          label={t`Games`}
          helpTitle={helpTitle}
          help={t`Choose at least one game. Use the empty game slot to add another option. Players vote only when multiple games are proposed.`}
        />
        <GroupedList>
          {row.games.map((game) => (
            <GameListRow
              key={game.id}
              name={game.name}
              imageUrl={game.imageUrl}
              year={game.year}
              average={game.average}
              rank={game.rank}
              durationMinutes={eventGameDuration(game)}
              actions={
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  aria-label={`${t`Remove game`}: ${game.name}`}
                  isDisabled={busy}
                  onPress={() =>
                    onChange({ games: row.games.filter((candidate) => candidate.id !== game.id) })
                  }
                >
                  <X className="size-4" aria-hidden />
                </Button>
              }
            />
          ))}
          <GameListRow
            name={t`Choose a game`}
            onPress={busy || row.games.length >= 20 ? undefined : onGame}
          />
        </GroupedList>
        {fieldError("games") ? (
          <p role="alert" className="text-sm text-danger">
            {row.games.length ? t`Choose compatible games.` : t`Choose at least one game.`}
          </p>
        ) : null}
      </section>
    </>
  );
  return (
    <section className="space-y-4">
      {information}
      {scheduleAndGames}
      {options}
      <div className="flex justify-end">
        <Button
          isIconOnly
          variant="danger"
          aria-label={t`Remove table`}
          isDisabled={busy}
          onPress={onRemove}
        >
          <Trash2 className="size-5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
function PlayerCount({
  label,
  value,
  min,
  max,
  busy,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  busy: boolean;
  onChange: (value: number) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-3">
        <Button
          isIconOnly
          size="sm"
          className="size-9 min-h-9 min-w-9"
          variant="primary"
          aria-label={t`Decrease ${label}`}
          isDisabled={busy || value <= min}
          onPress={() => onChange(value - 1)}
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <output className="min-w-6 text-center font-bold" aria-label={label}>
          {value}
        </output>
        <Button
          isIconOnly
          size="sm"
          className="size-9 min-h-9 min-w-9"
          variant="primary"
          aria-label={t`Increase ${label}`}
          isDisabled={busy || value >= max}
          onPress={() => onChange(value + 1)}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
