"use client";
import { communityAccessDenied, type useRecordTables } from "@board-game-organizer/shared";
import { Button, Skeleton, Table } from "@heroui/react";
import { TableLayout, Virtualizer } from "@heroui/react/rac";
import { useLingui } from "@lingui/react/macro";
import { EventTableCard } from "./EventTableCard";

const layoutOptions = { estimatedRowHeight: 260, headingHeight: 1, gap: 12 };
export function EventTables({ query: q }: { query: ReturnType<typeof useRecordTables> }) {
  const { t } = useLingui();
  const items = communityAccessDenied(q.error) ? [] : q.items;
  const more = () => {
    if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError)
      void q.fetchNextPage({ cancelRefetch: false });
  };
  return (
    <>
      {items.length ? (
        <Virtualizer layout={TableLayout} layoutOptions={layoutOptions} shouldObserveItemSize>
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label={t`Table list`}
                selectionMode="none"
                className="h-[65vh] min-h-64 w-full overflow-auto"
                onScroll={(e) => {
                  const n = e.currentTarget;
                  if (n.scrollTop + n.clientHeight >= n.scrollHeight - 200) more();
                }}
              >
                <Table.Header className="sr-only">
                  <Table.Column id="table" isRowHeader>{t`Table list`}</Table.Column>
                </Table.Header>
                <Table.Body items={items}>
                  {(row) => (
                    <Table.Row id={row.id} textValue={row.name}>
                      <Table.Cell className="p-0">
                        <EventTableCard table={row} context="event" />
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Virtualizer>
      ) : null}
      {!q.isPending && !q.isError && !items.length ? (
        <p role="status" className="text-muted">{t`No tables found`}</p>
      ) : null}
      {q.isPending || q.isFetchingNextPage ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load tables`}</p>
          <Button variant="secondary" onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {q.hasNextPage ? (
        <Button
          variant="secondary"
          isDisabled={q.isFetching || q.isFetchNextPageError}
          onPress={more}
        >{t`Load more`}</Button>
      ) : null}
    </>
  );
}
