import { useEffect, useMemo, useRef } from "react";
import type { FlatList } from "react-native";

type ScrollHandle = Pick<FlatList<unknown>, "scrollToIndex" | "scrollToOffset">;

import { useFormInteraction } from "@/components/common/ui/FormInteractionScope";

/** Reveal an unmounted invalid row first, then its first invalid field. User navigation cancels it. */
export function useValidationList({
  scope,
  attempt,
  index,
  active = true,
}: {
  scope: string;
  attempt: number;
  index?: number;
  active?: boolean;
}) {
  const interaction = useFormInteraction();
  const ref = useRef<ScrollHandle | null>(null),
    seen = useRef(0),
    retries = useRef(0);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const currentActive = useRef(active);
  currentActive.current = active;
  const effectScope = useRef(scope);
  const visible = useRef({ scope, indices: new Set<number>() });
  if (visible.current.scope !== scope) visible.current = { scope, indices: new Set() };
  const pending = useRef<{
    scope: string;
    index: number;
    ticket: NonNullable<ReturnType<NonNullable<typeof interaction>["deferFirstError"]>>;
  } | null>(null);
  useEffect(
    () => () => {
      if (pending.current?.scope === scope) pending.current = null;
      interaction?.cancelErrorFocus();
    },
    [scope, interaction],
  );
  useEffect(() => {
    if (effectScope.current !== scope) {
      effectScope.current = scope;
      pending.current = null;
      interaction?.cancelErrorFocus();
    }
    if (!active) {
      pending.current = null;
      interaction?.cancelErrorFocus();
      return;
    }
    if (!attempt || seen.current === attempt || !interaction) return;
    seen.current = attempt;
    const ticket = interaction.deferFirstError();
    if (index === undefined) {
      ticket.reveal();
      return;
    }
    pending.current = { scope, index, ticket };
    retries.current = 0;
    ref.current?.scrollToIndex({ index, viewPosition: 0, animated: false });
    if (visible.current.indices.has(index)) {
      pending.current = null;
      ticket.reveal();
    }
  }, [active, attempt, index, scope, interaction]);
  return useMemo(
    () => ({
      ref: (list: ScrollHandle | null) => {
        ref.current = list;
      },
      onViewableItemsChanged: ({
        viewableItems,
      }: {
        viewableItems: readonly { index: number | null }[];
      }) => {
        if (currentScope.current !== scope || !currentActive.current) return;
        visible.current = {
          scope,
          indices: new Set(viewableItems.flatMap((row) => (row.index === null ? [] : [row.index]))),
        };
        const job = pending.current;
        if (job?.scope === scope && visible.current.indices.has(job.index)) {
          pending.current = null;
          job.ticket.reveal();
        }
      },
      onScrollToIndexFailed: ({
        averageItemLength,
        index: failedIndex,
      }: {
        averageItemLength: number;
        index: number;
      }) => {
        const job = pending.current;
        if (
          !job ||
          job.scope !== scope ||
          currentScope.current !== scope ||
          !currentActive.current ||
          job.index !== failedIndex ||
          !job.ticket.isCurrent()
        )
          return;
        ref.current?.scrollToOffset({ offset: averageItemLength * failedIndex, animated: false });
        if (retries.current++ < 5)
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (
                pending.current === job &&
                currentScope.current === scope &&
                currentActive.current &&
                job.ticket.isCurrent()
              )
                ref.current?.scrollToIndex({
                  index: failedIndex,
                  viewPosition: 0,
                  animated: false,
                });
            }),
          );
      },
    }),
    [scope],
  );
}
