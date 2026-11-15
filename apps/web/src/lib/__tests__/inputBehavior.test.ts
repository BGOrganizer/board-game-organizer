import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installInputBehavior } from "../inputBehavior";

// Real DOM listeners/MutationObserver, with deterministic layout (not browser keyboard evidence).
let dispose: (() => void) | undefined;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let viewport: EventTarget & { height: number; offsetTop: number };
const rect = (top: number, height = 44) =>
  ({
    top,
    bottom: top + height,
    height,
    width: 300,
    left: 0,
    right: 300,
    x: 0,
    y: top,
    toJSON() {},
  }) as DOMRect;
function geometry(node: HTMLElement, top: number, height = 44) {
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue(rect(top, height));
  vi.spyOn(node, "getClientRects").mockReturnValue([rect(top, height)] as unknown as DOMRectList);
}
function flush() {
  for (let count = 0; frames.size && count < 10; count++) {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(0);
  }
}
async function mutations() {
  await Promise.resolve();
  flush();
}
function form(markup = '<input aria-invalid="true">') {
  document.body.innerHTML = `<div data-form-scope>${markup}<button data-form-submit>Save</button></div>`;
  const scope = document.body.firstElementChild as HTMLElement;
  for (const node of scope.querySelectorAll<HTMLElement>("*")) geometry(node, 500);
  const button = scope.querySelector<HTMLButtonElement>("[data-form-submit]"),
    input = scope.querySelector("input");
  if (!button || !input) throw Error("Missing form controls");
  return { scope, button, input };
}
beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  viewport = Object.assign(new EventTarget(), { height: 320, offsetTop: 20 });
  vi.stubGlobal("visualViewport", viewport);
  geometry(document.documentElement, 0, 800);
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 800,
  });
  document.documentElement.scrollTop = 0;
  document.documentElement.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
    document.documentElement.scrollTop =
      typeof options === "number" ? options : (options?.top ?? 0);
  });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("installInputBehavior local owners and first blocking errors", () => {
  it("pins the field and label to its local list, not the page, and restores range on blur", () => {
    const { input, scope } = form("<div data-form-field><label>Title</label><input></div>");
    scope.style.overflowY = "auto";
    scope.style.paddingBottom = "7px";
    geometry(scope, 100, 200);
    geometry(input.parentElement as HTMLElement, 450, 100);
    geometry(input, 500);
    Object.defineProperty(scope, "clientHeight", { value: 200 });
    Object.defineProperty(scope, "scrollHeight", { value: 200 });
    const scroll = vi.fn();
    scope.scrollTo = scroll;
    dispose = installInputBehavior();
    input.focus();
    flush();
    expect(scroll).toHaveBeenLastCalledWith({ top: 334, behavior: "instant" });
    expect(document.documentElement.scrollTo).not.toHaveBeenCalled();
    expect(Number.parseFloat(scope.style.paddingBottom)).toBeGreaterThan(7);
    input.blur();
    expect(scope.style.paddingBottom).toBe("7px");
    viewport.dispatchEvent(new Event("resize"));
    flush();
    expect(scroll).toHaveBeenCalledOnce();
  });
  it("keeps an oversized label from hiding the field", () => {
    const { input } = form("<div data-form-field><label>Title</label><input></div>");
    geometry(input.parentElement as HTMLElement, 10, 600);
    dispose = installInputBehavior();
    input.focus();
    flush();
    expect(document.documentElement.scrollTo).toHaveBeenLastCalledWith({
      top: 448,
      behavior: "instant",
    });
  });
  it("fits a portal dialog to VisualViewport and restores inline styles on cleanup", () => {
    const { input, scope } = form("<input>");
    scope.setAttribute("role", "dialog");
    scope.style.maxHeight = "600px";
    geometry(scope, 40, 600);
    dispose = installInputBehavior();
    input.focus();
    flush();
    expect(scope.style.maxHeight).toBe("284px");
    expect(scope.style.overflowY).toBe("auto");
    expect(document.documentElement.style.getPropertyValue("--app-visible-height")).toBe("320px");
    dispose();
    dispose = undefined;
    expect(scope.style.maxHeight).toBe("600px");
    expect(scope.style.overflowY).toBe("");
    expect(document.documentElement.style.getPropertyValue("--app-visible-height")).toBe("");
  });
  it("selects the first visible invalid selector, ignoring hidden/inert fields", () => {
    const { button, scope } = form(
      '<div hidden><input aria-invalid="true"></div><div inert><input aria-invalid="true"></div><input style="visibility:hidden" aria-invalid="true"><div data-form-error>Choose a location</div><input aria-invalid="true">',
    );
    dispose = installInputBehavior();
    button.click();
    flush();
    expect(document.activeElement).toBe(scope.querySelector("[data-form-error]"));
    dispose();
    dispose = undefined;
    expect(scope.querySelector("[data-form-error]")?.hasAttribute("tabindex")).toBe(false);
  });
  it.each(["location", "game"])(
    "focuses the corrective %s selector after ancillary help without activating it",
    (selector) => {
      const { button, scope } = form(
        `<div data-form-field aria-invalid="true"><label>${selector}</label><button type="button">Field help</button><button type="button">Remove</button><button data-form-control type="button" id="choose-location">Choose</button></div><input>`,
      );
      const choose = scope.querySelector<HTMLButtonElement>("#choose-location");
      if (!choose) throw Error("Missing location action");
      const open = vi.fn();
      choose.addEventListener("click", open);
      dispose = installInputBehavior();
      button.click();
      flush();
      expect(document.activeElement).toBe(choose);
      expect(open).not.toHaveBeenCalled();
    },
  );
  it("uses actual visual order rather than DOM registration order", () => {
    const { button, input, scope } = form(
      '<input aria-invalid="true"><textarea aria-invalid="true"></textarea>',
    );
    const visuallyFirst = scope.querySelector("textarea");
    if (!visuallyFirst) throw Error("Missing second control");
    geometry(input, 600);
    geometry(visuallyFirst, 300);
    dispose = installInputBehavior();
    button.click();
    flush();
    expect(document.activeElement).toBe(visuallyFirst);
  });
  it("focuses the required datetime input after help and a valid editable control", () => {
    const { button, scope } = form(
      '<section data-form-field data-form-error><label>Start Date and Time</label><button type="button">Start Date and Time: Field help</button><input value="valid"><input id="required-date" type="datetime-local" required></section>',
    );
    const date = scope.querySelector<HTMLInputElement>("#required-date");
    dispose = installInputBehavior();
    button.click();
    flush();
    expect(document.activeElement).toBe(date);
  });
  it("never selects ancillary help when no corrective control is available", () => {
    const { button, scope } = form(
      '<section data-form-field data-form-error><button type="button">Field help</button><input readonly value="unchangeable"></section>',
    );
    dispose = installInputBehavior();
    button.click();
    flush();
    expect(document.activeElement).toBe(scope.querySelector("[data-form-field]"));
  });
  it("focuses a native invalid control before native submit dispatch", () => {
    const { input } = form("<input required>");
    dispose = installInputBehavior();
    input.dispatchEvent(new Event("invalid"));
    flush();
    expect(document.activeElement).toBe(input);
  });
  it("focuses text inside the invalid field group, retaining the label", () => {
    const { input, button } = form(
      '<div data-form-field aria-invalid="true"><label>Title</label><input></div>',
    );
    geometry(input.parentElement as HTMLElement, 460, 84);
    dispose = installInputBehavior();
    button.click();
    flush();
    expect(document.activeElement).toBe(input);
    expect(document.documentElement.scrollTo).toHaveBeenLastCalledWith({
      top: 424,
      behavior: "instant",
    });
  });
  it("reveals a remote summary only inside the finite submission window", async () => {
    const { button, scope } = form("<input>");
    dispose = installInputBehavior();
    button.click();
    flush();
    const summary = document.createElement("div");
    summary.dataset.formError = "";
    geometry(summary, 500);
    scope.append(summary);
    await mutations();
    expect(document.activeElement).toBe(summary);
    summary.remove();
    button.click();
    flush();
    vi.advanceTimersByTime(501);
    scope.append(summary);
    await mutations();
    expect(document.activeElement).not.toBe(summary);
  });
  it.each(["pointerdown", "touchstart", "touchmove", "wheel", "input"])(
    "cancels deferred error focus on %s",
    async (type) => {
      const { button, input } = form();
      dispose = installInputBehavior();
      button.click();
      input.dispatchEvent(new Event(type, { bubbles: true }));
      flush();
      await mutations();
      expect(document.activeElement).not.toBe(input);
      expect(document.documentElement.scrollTo).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "cancels an obsolete source revision before queued focus (measured: %s)",
    async (measured) => {
      const { button, input, scope } = form();
      scope.dataset.formSource = "api/user/version1";
      dispose = installInputBehavior();
      button.click();
      if (measured) {
        const callback = [...frames.values()][0];
        frames.clear();
        callback(0);
      }
      scope.dataset.formSource = "api/user/version2";
      await mutations();
      expect(document.activeElement).not.toBe(input);
      expect(document.documentElement.scrollTo).not.toHaveBeenCalled();
    },
  );
  it("cancels delayed focus when the target becomes inert or is disconnected", () => {
    const { button, input, scope } = form();
    dispose = installInputBehavior();
    button.click();
    const callback = [...frames.values()][0];
    frames.clear();
    callback(0);
    scope.setAttribute("inert", "");
    flush();
    expect(document.activeElement).not.toBe(input);
    scope.removeAttribute("inert");
    button.click();
    scope.remove();
    flush();
    expect(document.documentElement.scrollTo).not.toHaveBeenCalled();
  });
  it("stops viewport repinning after a drag but not a field edit, and remeasures content changes", async () => {
    const { input, scope } = form("<input>");
    dispose = installInputBehavior();
    input.focus();
    flush();
    const scroll = vi.mocked(document.documentElement.scrollTo);
    scroll.mockClear();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(scroll).toHaveBeenCalledOnce();
    scope.append(document.createElement("p"));
    await mutations();
    expect(scroll).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new Event("wheel"));
    viewport.dispatchEvent(new Event("resize"));
    flush();
    expect(scroll).toHaveBeenCalledTimes(2);
  });
  it("does not treat arrow-key editing as manual scrolling but cancels page navigation", () => {
    const { input } = form("<input>");
    dispose = installInputBehavior();
    input.focus();
    flush();
    const scroll = vi.mocked(document.documentElement.scrollTo);
    scroll.mockClear();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    viewport.dispatchEvent(new Event("resize"));
    flush();
    expect(scroll).toHaveBeenCalledOnce();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
    viewport.dispatchEvent(new Event("resize"));
    flush();
    expect(scroll).toHaveBeenCalledOnce();
  });
  it("bounds search results to their owner and restores an existing height when the portal unmounts", async () => {
    const { input, scope } = form("<input><div data-input-results></div>");
    scope.setAttribute("data-input-scope", "");
    scope.setAttribute("role", "dialog");
    scope.style.setProperty("--input-results-height", "220px");
    scope.style.paddingBottom = "4px";
    geometry(scope, 100, 220);
    const results = scope.querySelector<HTMLElement>("[data-input-results]");
    if (!results) throw Error("Missing search results");
    geometry(results, 450, 100);
    dispose = installInputBehavior();
    input.focus();
    flush();
    expect(
      Number.parseFloat(scope.style.getPropertyValue("--input-results-height")),
    ).toBeGreaterThanOrEqual(96);
    scope.remove();
    await mutations();
    expect(scope.style.getPropertyValue("--input-results-height")).toBe("220px");
    expect(scope.style.paddingBottom).toBe("4px");
    expect(scope.style.overflowY).toBe("");
  });
  it("clears extra scroll range when a focused field is unmounted without a blur event", async () => {
    const { input } = form("<input>");
    dispose = installInputBehavior();
    input.focus();
    flush();
    expect(Number.parseFloat(document.documentElement.style.paddingBottom)).toBeGreaterThan(0);
    input.remove();
    await mutations();
    expect(document.documentElement.style.paddingBottom).toBe("");
  });
  it("handles submit events, ignores disabled actions and keeps only the latest submit scope", () => {
    const { button, input, scope } = form();
    dispose = installInputBehavior();
    button.setAttribute("aria-disabled", "true");
    button.click();
    flush();
    expect(document.activeElement).not.toBe(input);
    scope.dispatchEvent(new Event("submit", { bubbles: true }));
    flush();
    expect(document.activeElement).toBe(input);
    input.blur();
    const other = document.createElement("div");
    other.dataset.formScope = "";
    document.body.append(other);
    scope.dispatchEvent(new Event("submit", { bubbles: true }));
    other.dispatchEvent(new Event("submit", { bubbles: true }));
    flush();
    expect(document.activeElement).not.toBe(input);
  });
  it("disconnects observers, listeners and queued callbacks on route cleanup", async () => {
    const { input, button, scope } = form();
    dispose = installInputBehavior();
    button.click();
    dispose();
    dispose = undefined;
    scope.append(document.createElement("div"));
    input.focus();
    viewport.dispatchEvent(new Event("resize"));
    flush();
    await mutations();
    expect(document.documentElement.scrollTo).not.toHaveBeenCalled();
  });
});
