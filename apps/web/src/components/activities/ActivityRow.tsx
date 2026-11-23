"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { ActivityRowContent } from "./ActivityRowContent";

export function ActivityRow(props: Omit<ComponentProps<typeof ActivityRowContent>, "renderLink">) {
  return (
    <ActivityRowContent
      {...props}
      renderLink={(href, name, key) => (
        <Link
          key={key}
          href={href}
          className="rounded font-medium focus-visible:outline-2 focus-visible:outline-accent"
        >
          {name}
        </Link>
      )}
    />
  );
}
