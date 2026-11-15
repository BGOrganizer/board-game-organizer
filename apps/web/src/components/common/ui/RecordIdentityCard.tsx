import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ListCard } from "./ListCard";

/** Top-left title band; a single bottom-right control row stays within the card. */
export function RecordIdentityCard({
  title,
  heading: Heading = "h1",
  icon: Icon,
  background,
  titleAccessory,
  titleAction,
  children,
}: {
  title: string;
  heading?: "h1" | "h2";
  icon: LucideIcon;
  background: ReactNode;
  titleAccessory?: ReactNode;
  titleAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ListCard background={background}>
      <div
        data-testid="record-identity-card"
        className="flex min-w-0 grow flex-col items-start gap-3 py-4"
      >
        <div className="dark relative flex w-full min-w-0 items-start gap-2 bg-background/80 px-4 py-2 text-foreground">
          <Icon className="mt-1 size-5 shrink-0" aria-hidden />
          <Heading className="min-w-0 text-lg font-semibold text-foreground [overflow-wrap:anywhere]">
            {title}
          </Heading>
          {titleAccessory}
          {titleAction ? <span className="ml-auto shrink-0">{titleAction}</span> : null}
        </div>
        <div className="relative mt-auto w-full min-w-0 shrink-0 overflow-x-auto overscroll-x-contain py-1">
          <div className="flex w-max min-w-full flex-nowrap items-center justify-end px-4 [&>*]:shrink-0">
            {children}
          </div>
        </div>
      </div>
    </ListCard>
  );
}
