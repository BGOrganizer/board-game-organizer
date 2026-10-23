"use client";
import type { EventTableDraft } from "@board-game-organizer/shared";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Gamepad2, Presentation, Trophy, UsersRound } from "lucide-react";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";

export function EventDraftTableCard({ row }: { row: EventTableDraft }) {
  const { t } = useLingui();
  return (
    <ListCard>
      <div className="flex min-w-0 items-start gap-4 p-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-default-100">
          <Gamepad2 className="size-8 text-default-500" aria-hidden />
        </div>
        <ListCardBody
          title={row.name}
          titleAccessory={
            <Chip
              size="sm"
              color={row.rankingEnabled ? "success" : "default"}
              variant="soft"
              className="shrink-0 px-2 py-1"
            >
              <Trophy className="size-3" aria-hidden />
              {row.rankingEnabled ? t`Rated` : t`Unrated`}
            </Chip>
          }
        >
          <p className="truncate text-sm" title={row.games.map((game) => game.name).join(", ")}>
            {row.games.map((game) => game.name).join(", ")}
          </p>
          <p className="flex items-center gap-2 text-sm text-default-500">
            <UsersRound className="size-4 shrink-0" aria-hidden />
            <span>
              {t`Minimum players`}: {row.minPlayers} · {t`Maximum players`}: {row.maxPlayers}
            </span>
          </p>
          <p className="flex items-center gap-2 text-sm text-default-500">
            <Presentation className="size-4 shrink-0" aria-hidden />
            <span>
              {row.demonstratorUserId ? (row.demonstratorName ?? t`Unknown`) : t`No demonstrator`}
            </span>
          </p>
        </ListCardBody>
      </div>
    </ListCard>
  );
}
