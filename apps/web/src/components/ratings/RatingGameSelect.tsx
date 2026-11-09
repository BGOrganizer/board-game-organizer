"use client";
import type { ProfileRatingGame } from "@board-game-organizer/schemas";
import { Button, Label, ListBox, Select } from "@heroui/react";
import { Collection, ListLayout, Virtualizer } from "@heroui/react/rac";
import { useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { LeaderboardGameCover } from "./LeaderboardGameCover";

/** Presentation only: GLOBAL personal games and GROUP games keep their own query ownership. */
export function RatingGameSelect({
  value,
  selectedId,
  games,
  onChange,
  onClose,
  children,
  footer,
  empty,
}: {
  value?: ProfileRatingGame | null;
  selectedId: number | null;
  games: readonly ProfileRatingGame[];
  onChange: (id: number | null) => void;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
}) {
  const { t } = useLingui();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const changeOpen = (next: boolean) => {
    // Overlay dismissal and search Escape can request the same transition before React commits.
    if (openRef.current === next) return;
    openRef.current = next;
    setOpen(next);
    if (!next) onClose?.();
  };
  const handleEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      changeOpen(false);
      trigger.current?.focus();
    }
  };
  return (
    <Select
      allowsEmptyCollection
      className="w-full"
      placeholder={t`Select a board game`}
      value={selectedId === null ? null : String(selectedId)}
      onChange={(key) => onChange(key === null ? null : Number(key))}
      isOpen={open}
      onOpenChange={changeOpen}
    >
      <Label>{t`Board game`}</Label>
      <div className="relative" data-slot="game-select-control">
        <Select.Trigger
          ref={trigger}
          className={selectedId !== null ? "w-full items-center gap-2 pe-12" : "w-full"}
        >
          {value ? <LeaderboardGameCover imageUrl={value.imageUrl} /> : null}
          <Select.Value className="sr-only">{() => value?.name ?? ""}</Select.Value>
          <span
            data-slot="selected-game-name"
            className="min-w-0 flex-1 truncate text-left"
            aria-hidden
          >
            {value?.name ?? (selectedId !== null ? t`Unknown` : t`Select a board game`)}
          </span>
          {selectedId === null ? <Select.Indicator /> : null}
        </Select.Trigger>
        {selectedId !== null ? (
          <Button
            slot={null}
            isIconOnly
            variant="ghost"
            size="sm"
            className="absolute end-1 top-1/2 z-10 -translate-y-1/2"
            aria-label={t`Clear board game selection`}
            onPress={() => {
              onChange(null);
              trigger.current?.focus();
            }}
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      <Select.Popover
        data-input-scope
        data-input-overlay
        className="w-(--trigger-width) max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <div onKeyDownCapture={handleEscape}>
          {children}
          <Virtualizer layout={ListLayout} shouldObserveItemSize>
            <ListBox
              data-input-results
              className="h-[var(--input-results-height,18rem)] max-h-72 overflow-auto"
              renderEmptyState={() => empty ?? t`No games found`}
            >
              <Collection items={games}>
                {(game) => (
                  <ListBox.Item key={game.id} id={String(game.id)} textValue={game.name}>
                    <span className="flex min-w-0 items-center gap-2">
                      <LeaderboardGameCover imageUrl={game.imageUrl} />
                      <span className="min-w-0 flex-1 truncate">{game.name}</span>
                    </span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                )}
              </Collection>
            </ListBox>
          </Virtualizer>
          {footer}
        </div>
      </Select.Popover>
    </Select>
  );
}
