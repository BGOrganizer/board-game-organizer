"use client";

import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { windowedListLayout } from "@/lib/windowed-list";

/** Document scrolling with measured rows: RAC's Virtualizer requires its own scroll viewport. */
export function WindowedList<T>({
  items,
  itemKey,
  renderItem,
  label,
  estimatedRowHeight,
  gap = 8,
  onBeginScroll,
  onEndReached,
}: {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  label: string;
  estimatedRowHeight: number;
  gap?: number;
  onBeginScroll?: () => void;
  onEndReached: () => void;
}) {
  const root = useRef<HTMLUListElement>(null);
  const measured = useRef(new Map<string, number>());
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const [, setRevision] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const callbacks = useRef({ onBeginScroll, onEndReached });
  callbacks.current = { onBeginScroll, onEndReached };
  const active = useRef(false);
  const geometry = useRef<{ keys: string[]; offsets: number[]; top: number }>({
    keys: [],
    offsets: [],
    top: 0,
  });
  const frame = useRef<number | null>(null);
  const update = useCallback(() => {
    frame.current = null;
    const node = root.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setViewport((old) =>
      old.top === -box.top && old.height === window.innerHeight
        ? old
        : { top: -box.top, height: window.innerHeight },
    );
    if (active.current && box.bottom <= window.innerHeight + 300) callbacks.current.onEndReached();
  }, []);
  const schedule = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(update);
  }, [update]);
  useEffect(() => {
    const begin = () => {
      active.current = true;
      callbacks.current.onBeginScroll?.();
      schedule();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) begin();
    };
    const observer = new ResizeObserver(schedule);
    if (root.current) observer.observe(root.current);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("wheel", begin, { passive: true });
    window.addEventListener("touchstart", begin, { passive: true });
    window.addEventListener("keydown", keyboard);
    schedule();
    return () => {
      observer.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("wheel", begin);
      window.removeEventListener("touchstart", begin);
      window.removeEventListener("keydown", keyboard);
    };
  }, [schedule]);
  const measure = useCallback(
    (key: string, rawHeight: number) => {
      const height = Math.round(rawHeight * 100) / 100;
      if (height <= 0 || measured.current.get(key) === height) return;
      const oldHeight = measured.current.get(key) ?? estimatedRowHeight;
      measured.current.set(key, height);
      const index = geometry.current.keys.indexOf(key);
      if (active.current && index >= 0 && geometry.current.offsets[index] < geometry.current.top)
        window.scrollBy(0, height - oldHeight);
      setRevision((value) => value + 1);
    },
    [estimatedRowHeight],
  );
  const keys = items.map(itemKey);
  const layout = windowedListLayout(
    keys,
    measured.current,
    estimatedRowHeight,
    gap,
    viewport.top,
    viewport.height,
  );
  geometry.current = { keys, offsets: layout.offsets, top: viewport.top };
  const indexes = Array.from(
    { length: layout.end - layout.start },
    (_, index) => layout.start + index,
  );
  const focusedIndex = focused === null ? -1 : keys.indexOf(focused);
  if (focusedIndex >= 0 && (focusedIndex < layout.start || focusedIndex >= layout.end))
    indexes.push(focusedIndex);
  return (
    <ul
      ref={root}
      data-testid="document-window-list"
      aria-label={label}
      style={{
        position: "relative",
        height: layout.total,
        listStyle: "none",
        padding: 0,
        margin: 0,
        overflowAnchor: "none",
      }}
    >
      {indexes.map((index) => (
        <MeasuredRow
          key={keys[index]}
          id={keys[index]}
          top={layout.offsets[index]}
          position={index + 1}
          measure={measure}
          focus={setFocused}
        >
          {renderItem(items[index])}
        </MeasuredRow>
      ))}
    </ul>
  );
}

const MeasuredRow = memo(function MeasuredRow({
  id,
  top,
  position,
  measure,
  focus,
  children,
}: {
  id: string;
  top: number;
  position: number;
  measure: (id: string, height: number) => void;
  focus: (id: string | null) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback(
    (node: HTMLLIElement | null) => {
      observer.current?.disconnect();
      ref.current = node;
      if (node) {
        const update = () => measure(id, node.getBoundingClientRect().height);
        observer.current = new ResizeObserver(update);
        observer.current.observe(node);
        update();
      }
    },
    [id, measure],
  );
  return (
    <li
      ref={attach}
      aria-posinset={position}
      aria-setsize={-1}
      style={{ position: "absolute", top, width: "100%" }}
      onFocusCapture={() => focus(id)}
      onBlurCapture={() =>
        queueMicrotask(() => {
          if (
            !ref.current?.contains(document.activeElement) &&
            !ref.current?.querySelector('[aria-expanded="true"]')
          )
            focus(null);
        })
      }
    >
      {children}
    </li>
  );
});
