"use client";

import { Accordion } from "@heroui/react";
import type { ReactNode } from "react";
import { GroupedRow } from "./GroupedRow";

export type GroupedRowDisclosure = { label: string; triggerText: string; content: ReactNode };

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
                      className="min-h-11 min-w-11 flex-col justify-center gap-0.5 p-0 text-muted pointer-fine:min-h-8 pointer-fine:min-w-6"
                    >
                      <span className="whitespace-nowrap text-xs leading-[14px]">
                        {disclosure.triggerText}
                      </span>
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
