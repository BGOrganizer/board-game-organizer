import type { ReactNode } from "react";
import { ListCard } from "./ListCard";

/** One image-backed HeroUI identity; title and informational controls remain over the artwork. */
export function RecordIdentityCard({
  title,
  icon,
  background,
  titleAccessory,
  children,
}: {
  title: string;
  icon: ReactNode;
  background: ReactNode;
  titleAccessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ListCard background={background}>
      <div className="flex min-w-0 flex-nowrap items-center justify-between gap-[8px] bg-background/90 p-[16px]">
        <div className="flex min-w-0 flex-1 items-center gap-[8px]">
          {icon}
          <h1
            title={title}
            className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground"
          >
            {title}
          </h1>
          {titleAccessory}
        </div>
        <div className="relative ml-auto min-w-0 max-w-[60%] shrink-0 overflow-x-auto overscroll-x-contain p-1">
          <div className="flex w-max min-w-full flex-nowrap items-center justify-end [&>*]:shrink-0">
            {children}
          </div>
        </div>
      </div>
    </ListCard>
  );
}
