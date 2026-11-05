"use client";
import { type EventTableDraft, publicTableTimeBounds } from "@board-game-organizer/shared";
import { Button, Input, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Minus, Plus, Trash2, UserRoundPen, UserRoundPlus, X } from "lucide-react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { GameListRow } from "@/components/games/GameListRow";

export function EventDraftTableEditor({
  row,
  publicGroup,
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
  const bounds = publicTableTimeBounds(
    eventStartWall,
    eventEndWall,
    Math.max(1, ...row.games.map((game) => game.maxPlayMinutes ?? game.manualDurationMinutes ?? 1)),
  );
  const helpTitle = t`Field help`;
  return (
    <section className="space-y-4 rounded-xl bg-default p-4">
      <TextField
        value={row.name}
        onChange={(name) => onChange({ name })}
        isRequired
        isDisabled={busy}
        isInvalid={fieldError("name")}
      >
        <SearchHelpLabel
          label={t`Table name`}
          helpTitle={helpTitle}
          help={t`Name this table so players can recognize it. Use between 1 and 120 characters.`}
        />
        <Input placeholder={t`Strategy table`} maxLength={120} />
        {fieldError("name") ? (
          <p
            role="alert"
            className="text-sm text-danger"
          >{t`Enter a table name between 1 and 120 characters.`}</p>
        ) : null}
      </TextField>
      <fieldset className="space-y-2" aria-label={t`Number of players`}>
        <SearchHelpLabel
          label={t`Number of players`}
          helpTitle={helpTitle}
          help={t`Choose the minimum on the left and maximum on the right. At least two players are required, and the minimum cannot exceed the maximum.`}
        />
        <div className="flex gap-4">
          <PlayerCount
            label={t`Minimum players`}
            value={row.minPlayers}
            min={2}
            max={row.maxPlayers}
            busy={busy}
            onChange={(minPlayers) => onChange({ minPlayers })}
          />
          <PlayerCount
            label={t`Maximum players`}
            value={row.maxPlayers}
            min={row.minPlayers}
            max={Number.MAX_SAFE_INTEGER}
            busy={busy}
            onChange={(maxPlayers) => onChange({ maxPlayers })}
          />
        </div>
      </fieldset>
      {fieldError("minPlayers") || fieldError("maxPlayers") ? (
        <p
          role="alert"
          className="text-sm text-danger"
        >{t`The minimum must be at least two and cannot exceed the maximum.`}</p>
      ) : null}
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
          <div className="space-y-2">
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
          </div>
        </>
      ) : null}
      <section className="space-y-2">
        <SearchHelpLabel
          label={t`Games`}
          helpTitle={helpTitle}
          help={t`Choose at least one game. Use the empty game slot to add another option. Players vote only when multiple games are proposed.`}
        />
        <GroupedList>
          {row.games.map((game, index) => (
            <GameListRow
              key={game.id}
              name={game.name}
              imageUrl={game.imageUrl}
              year={game.year}
              average={game.average}
              rank={game.rank}
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
            >
              {publicGroup ? (
                game.maxPlayMinutes ? (
                  <p className="text-sm text-muted">
                    {t`Duration`}: {game.maxPlayMinutes} {t`minutes`} · BoardGameGeek
                  </p>
                ) : (
                  <TextField
                    value={
                      game.manualDurationMinutes === undefined
                        ? ""
                        : String(game.manualDurationMinutes)
                    }
                    onChange={(value) =>
                      onChange({
                        games: row.games.map((candidate) =>
                          candidate.id === game.id
                            ? {
                                ...candidate,
                                manualDurationMinutes: value ? Number(value) : undefined,
                              }
                            : candidate,
                        ),
                      })
                    }
                    isRequired
                    isDisabled={busy}
                    isInvalid={fieldError(`games.${index}.manualDurationMinutes`)}
                  >
                    <SearchHelpLabel
                      label={t`Manual duration in minutes`}
                      helpTitle={helpTitle}
                      help={t`BoardGameGeek has no duration for this game. Enter a positive whole number of minutes.`}
                    />
                    <Input type="number" min={1} />
                    {fieldError(`games.${index}.manualDurationMinutes`) ? (
                      <p
                        role="alert"
                        className="text-sm text-danger"
                      >{t`Enter a valid game duration in minutes.`}</p>
                    ) : null}
                  </TextField>
                )
              ) : null}
            </GameListRow>
          ))}
          <GameListRow
            name={t`Choose a game`}
            onPress={busy || row.games.length >= 20 ? undefined : onGame}
          />
        </GroupedList>
        {fieldError("games") && !row.games.length ? (
          <p role="alert" className="text-sm text-danger">{t`Choose at least one game.`}</p>
        ) : null}
      </section>
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
