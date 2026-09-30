import type { ReactNode } from "react";

export function EmptyList({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-default-500">
      <span aria-hidden="true">{icon}</span>
      <p>{children}</p>
    </div>
  );
}
