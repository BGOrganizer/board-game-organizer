"use client";

import { Accordion } from "@heroui/react";
import type { ReactNode } from "react";
import { GroupedRow } from "./GroupedRow";

export type GroupedRowDisclosure = { label: string; content: ReactNode };

export function ExpandableGroupedRow({
  disclosure,
  summary,
  overlay,
  actions,
}: {
  disclosure: GroupedRowDisclosure;
  summary: ReactNode;
  overlay?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li>
      <Accordion hideSeparator>
        <Accordion.Item>
          {({ isExpanded }) => (
            <>
              <GroupedRow as="div" className="flex-wrap">
                <div className="relative min-w-0 flex-1">
                  <Accordion.Heading>
                    <Accordion.Trigger
                      aria-label={disclosure.label}
                      className="min-h-11 gap-2 p-0 text-left text-foreground"
                    >
                      {summary}
                      <Accordion.Indicator
                        aria-hidden
                        className="ml-0 size-4 shrink-0 text-muted"
                      />
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  {overlay}
                </div>
                {actions}
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
