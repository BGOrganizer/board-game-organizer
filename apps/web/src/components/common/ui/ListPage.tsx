import type { ReactNode } from "react";

export function ListPage({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-28">{children}</section>
  );
}
