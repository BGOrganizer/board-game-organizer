const HEADER = "__resource-artwork-header__";

/** Per-list visibility, never a global resource/user cache. Only changed rows notify React. */
export function createArtworkVisibility() {
  let visible = new Set<string>();
  let headerBottom = 0;
  let headerTop = 0;
  let offset = 0;
  let viewportHeight = 0;
  const frames = new Map<string, { top: number; height: number }>();
  const measurements = new Map<string, () => void>();
  const subscriptions = new Map<string, Set<() => void>>();
  const change = (next: Set<string>) => {
    const previous = visible;
    visible = next;
    for (const [key, callbacks] of subscriptions)
      if (previous.has(key) !== next.has(key)) for (const callback of callbacks) callback();
  };
  const header = (next = new Set(visible)) => {
    if (viewportHeight > 0 && headerBottom > offset) next.add(HEADER);
    else next.delete(HEADER);
    for (const [key, frame] of frames) {
      const top = headerTop + frame.top;
      if (
        viewportHeight > 0 &&
        frame.height > 0 &&
        top + frame.height > offset &&
        top < offset + viewportHeight
      )
        next.add(key);
      else next.delete(key);
    }
    change(next);
  };
  return {
    headerKey: HEADER,
    isVisible: (key: string) => visible.has(key),
    subscribe(key: string, callback: () => void) {
      let callbacks = subscriptions.get(key);
      if (!callbacks) {
        callbacks = new Set();
        subscriptions.set(key, callbacks);
      }
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
        if (!callbacks.size) subscriptions.delete(key);
      };
    },
    update(items: readonly { key: string; isViewable: boolean }[]) {
      const next = new Set(items.filter((item) => item.isViewable).map((item) => item.key));
      header(next);
    },
    headerLayout(y: number, height: number) {
      headerTop = y;
      headerBottom = y + height;
      header();
      for (const measure of measurements.values()) measure();
    },
    viewport(height: number) {
      viewportHeight = height;
      header();
    },
    registerFrame(key: string, measure: () => void) {
      measurements.set(key, measure);
      measure();
      return () => {
        measurements.delete(key);
        frames.delete(key);
        const next = new Set(visible);
        next.delete(key);
        change(next);
      };
    },
    measureFrame(key: string) {
      measurements.get(key)?.();
    },
    frame(key: string, top: number, height: number) {
      frames.set(key, { top, height });
      header();
    },
    scroll(y: number, height = viewportHeight) {
      offset = Math.max(0, y);
      viewportHeight = height;
      header();
    },
  };
}
export type ArtworkVisibility = ReturnType<typeof createArtworkVisibility>;
