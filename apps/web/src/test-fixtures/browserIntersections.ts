import { vi } from "vitest";

/** Browser visibility boundary; real React Aria/application sentinel handlers remain installed. */
export function installBrowserIntersections() {
  const observers: BrowserIntersectionObserver[] = [];
  class BrowserIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null;
    readonly rootMargin: string;
    readonly thresholds = [0];
    readonly scrollMargin = "0px";
    readonly delay = 0;
    readonly trackVisibility = false;
    private readonly targets = new Set<Element>();
    constructor(
      private readonly callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      this.root = options?.root ?? null;
      this.rootMargin = options?.rootMargin ?? "0px";
      observers.push(this);
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
    get targetCount() {
      return this.targets.size;
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    intersect(isIntersecting: boolean) {
      const entries = [...this.targets].map((target) => ({
        target,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
        time: performance.now(),
      }));
      if (entries.length) this.callback(entries, this);
    }
  }
  vi.stubGlobal("IntersectionObserver", BrowserIntersectionObserver);
  return {
    intersect(isIntersecting = true) {
      for (const observer of [...observers]) observer.intersect(isIntersecting);
    },
    get observedTargetCount() {
      return observers.reduce((total, observer) => total + observer.targetCount, 0);
    },
  };
}
