"use client";

import { Accordion } from "@heroui/react";
import type { ReactNode } from "react";
import { GroupedRow } from "./GroupedRow";

export type GroupedRowDisclosure = { label: string; content: ReactNode };

export function ExpandableGroupedRow({
  disclosure,
  summary,
  actions,
}: {
  disclosure: GroupedRowDisclosure;
  summary: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li>
      <Accordion hideSeparator>
        <Accordion.Item>
          {({ isExpanded }) => (
            <>
              <GroupedRow as="div">
                <div className="flex min-w-0 flex-1 items-center gap-2">{summary}</div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {actions}
                  <Accordion.Heading>
                    <Accordion.Trigger
                      aria-label={disclosure.label}
                      className="size-11 justify-center p-0 text-muted pointer-fine:size-6"
                    >
                      <Accordion.Indicator aria-hidden className="ms-0 size-4 shrink-0" />
                    </Accordion.Trigger>
                  </Accordion.Heading>
                </div>
              </GroupedRow>
              <Accordion.Panel>
                {isExpanded ? (
                  <Accordion.Body className="pt-0 pr-3 pb-3 pl-4">
                    {disclosure.content}
                  </Accordion.Body>
                ) : null}
              </Accordion.Panel>
            </>
          )}
        </Accordion.Item>
      </Accordion>
    </li>
  );
}
