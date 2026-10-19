"use client";
import type { EventTableDraft } from "@board-game-organizer/shared";
import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Plus, Trash2, X } from "lucide-react";
import { GameListRow } from "@/components/games/GameListRow";
export function EventDraftTableEditor({
  row,
  publicGroup,
  busy,
  onChange,
  onRemove,
  onGame,
  onDemonstrator,
}: {
  row: EventTableDraft;
  publicGroup: boolean;
  busy: boolean;
  onChange: (value: Partial<EventTableDraft>) => void;
  onRemove: () => void;
  onGame: () => void;
  onDemonstrator: () => void;
}) {
  const { t } = useLingui();
  return (
    <section className="space-y-3 rounded-xl bg-default-100 p-4">
      <TextField
        value={row.name}
        onChange={(name) => onChange({ name })}
        isDisabled={busy}
        isRequired
      >
        <Label>{t`Table name`}</Label>
        <Input />
      </TextField>
      <div className="flex gap-3">
        <TextField
          value={String(row.minPlayers)}
          onChange={(value) => onChange({ minPlayers: Number(value) })}
          isDisabled={busy}
        >
          <Label>{t`Minimum players`}</Label>
          <Input type="number" min={1} />
        </TextField>
        <TextField
          value={String(row.maxPlayers)}
          onChange={(value) => onChange({ maxPlayers: Number(value) })}
          isDisabled={busy}
        >
          <Label>{t`Maximum players`}</Label>
          <Input type="number" min={1} />
        </TextField>
      </div>
      <Switch
        isSelected={row.rankingEnabled}
        onChange={(rankingEnabled) => onChange({ rankingEnabled })}
        isDisabled={busy}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {t`Enable ratings`}
        </Switch.Content>
      </Switch>
      {publicGroup ? (
        <>
          <TextField
            value={row.startsWall}
            onChange={(startsWall) => onChange({ startsWall })}
            isRequired
            isDisabled={busy}
          >
            <Label>{t`Table start`}</Label>
            <Input type="datetime-local" />
          </TextField>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              isDisabled={busy}
              onPress={onDemonstrator}
            >{t`Choose demonstrator`}</Button>
            {row.demonstratorUserId ? (
              <>
                <span>{row.demonstratorName ?? t`Unknown`}</span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`Remove demonstrator`}
                  onPress={() =>
                    onChange({ demonstratorUserId: undefined, demonstratorName: undefined })
                  }
                >
                  <X className="size-4" />
                </Button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
      <div className="space-y-3">
        {row.games.map((game) => (
          <div key={game.id} className="space-y-2 rounded-xl bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <GameListRow
                name={game.name}
                imageUrl={game.imageUrl}
                year={game.year}
                average={game.average}
                rank={game.rank}
              />
              <Button
                isIconOnly
                size="sm"
                variant="danger-soft"
                aria-label={`${t`Remove game`}: ${game.name}`}
                isDisabled={busy}
                onPress={() => onChange({ games: row.games.filter((g) => g.id !== game.id) })}
              >
                <X className="size-4" />
              </Button>
            </div>
            {publicGroup ? (
              game.maxPlayMinutes ? (
                <p>
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
                      games: row.games.map((g) =>
                        g.id === game.id
                          ? { ...g, manualDurationMinutes: value ? Number(value) : undefined }
                          : g,
                      ),
                    })
                  }
                  isRequired
                  isDisabled={busy}
                >
                  <Label>{t`Manual duration in minutes`}</Label>
                  <Input type="number" min={1} />
                </TextField>
              )
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" isDisabled={busy || row.games.length >= 20} onPress={onGame}>
          <Plus className="size-4" />
          {t`Add game`}
        </Button>
        <Button
          isIconOnly
          variant="danger-soft"
          aria-label={t`Remove table`}
          isDisabled={busy}
          onPress={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </section>
  );
}
