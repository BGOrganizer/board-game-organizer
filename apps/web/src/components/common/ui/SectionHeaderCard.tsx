import { Card } from "@heroui/react";
import type { ReactNode } from "react";

export function SectionHeaderCard({
  title,
  leading,
  description,
  action,
  children,
}: {
  title: string;
  leading: ReactNode;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-3 p-3 sm:p-4">
      <div className="flex items-center gap-3">
        {leading}
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-semibold">{title}</h2>
          {description ? <p className="break-words text-sm text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}
