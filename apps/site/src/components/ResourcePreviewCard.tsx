import { Card } from "@heroui/react/card";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, Dices, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { ArtworkSources } from "./ArtworkPicture";
import { ArtworkPicture } from "./ArtworkPicture";
import { PreviewPopover } from "./PreviewPopover";

const groupMotion = "/artwork/group-animated.svg";
const groupArtwork = "/artwork/group.svg";
const privateEventMotion = "/artwork/private-event-animated.svg";
const privateEventArtwork = "/artwork/private-event.svg";
const publicEventMotion = "/artwork/public-event-animated.svg";
const publicEventArtwork = "/artwork/public-event.svg";
const tableMotion = "/artwork/table-animated.svg";
const tableArtwork = "/artwork/table.svg";

const presentation = {
  group: { icon: UsersRound, artwork: [groupArtwork, groupMotion] },
  publicEvent: { icon: CalendarDays, artwork: [publicEventArtwork, publicEventMotion] },
  privateEvent: { icon: CalendarDays, artwork: [privateEventArtwork, privateEventMotion] },
  table: { icon: Dices, artwork: [tableArtwork, tableMotion] },
} satisfies Record<string, { icon: LucideIcon; artwork: ArtworkSources }>;

export interface PreviewIndicator {
  label: string;
  icon: LucideIcon;
  description: ReactNode;
  tone?: "muted" | "accent" | "success" | "warning";
}

export function ResourcePreviewCard({
  kind,
  title,
  indicators,
  children,
}: {
  kind: keyof typeof presentation;
  title: string;
  indicators: readonly PreviewIndicator[];
  children: ReactNode;
}) {
  const { icon: Icon, artwork } = presentation[kind];
  return (
    <Card className="resource-preview relative isolate overflow-hidden rounded-xl border border-border p-0 shadow-none">
      <Card.Content className="relative flex min-w-0 flex-col gap-3 p-4">
        <h3 data-slot="card-heading" className="flex min-w-0 items-center gap-2 font-semibold">
          <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 break-words">{title}</span>
        </h3>
        <div data-slot="card-body-row" className="relative flex min-w-0 items-end gap-4">
          <div
            data-slot="card-artwork"
            className="relative size-24 shrink-0 overflow-hidden rounded-lg"
          >
            <ArtworkPicture
              artwork={artwork}
              size={96}
              className="size-full rounded-lg bg-surface object-contain p-1"
            />
          </div>
          <div data-slot="card-facts" className="min-h-24 min-w-0 flex-1 pb-14">
            <div className="resource-facts">{children}</div>
          </div>
          <div
            data-slot="card-controls"
            className="absolute inset-x-0 bottom-0 overflow-x-auto py-0.5"
          >
            <div className="flex w-max min-w-full flex-nowrap justify-end gap-1 [&>*]:shrink-0">
              {indicators.map(({ label, icon, tone, description }) => (
                <PreviewPopover key={label} label={label} icon={icon} tone={tone}>
                  {description}
                </PreviewPopover>
              ))}
            </div>
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}
