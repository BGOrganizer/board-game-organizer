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
function autoDialog() {
  const { scope, input } = form(
    "<div data-form-field><input></div><button data-secondary>ND</button>",
  );
  scope.setAttribute("role", "dialog");
  scope.style.paddingBottom = "4px";
  const height = () => 200 + Math.max(0, Number.parseFloat(scope.style.paddingBottom) - 4);
  Object.defineProperty(scope, "clientHeight", { configurable: true, get: height });
  Object.defineProperty(scope, "scrollHeight", { configurable: true, get: height });
  vi.spyOn(scope, "getBoundingClientRect").mockImplementation(() => rect(40, height()));
  geometry(input.parentElement as HTMLElement, 100, 70);
  geometry(input, 120);
  scope.scrollTo = vi.fn();
  const secondary = scope.querySelector<HTMLButtonElement>("[data-secondary]");
  if (!secondary) throw new Error("Missing sibling control");
  viewport.height = 600;
  viewport.offsetTop = 0;
  return { scope, input, secondary };
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
  it("keeps an auto-height dialog's padding and height stable while each score character is entered", () => {
    const { scope, input } = autoDialog();
    dispose = installInputBehavior();
    input.focus();
    flush();
    const padding = scope.style.paddingBottom;
    const height = scope.clientHeight;
    expect(height).toBeGreaterThan(200);
    for (const value of ["-", "-1", "-12", "-12.", "-12.5", "-12.50"]) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      flush();
      expect(scope.style.paddingBottom).toBe(padding);
      expect(scope.clientHeight).toBe(height);
      expect(document.activeElement).toBe(input);
    }
  });
  it("keeps an internal pointer destination stable through pointerup and click, then restores on leaving the dialog", () => {
    const { scope, input, secondary } = autoDialog();
    dispose = installInputBehavior();
    input.focus();
    flush();
    const padding = scope.style.paddingBottom;
    const press = vi.fn();
    secondary.addEventListener("click", press);
    secondary.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    secondary.focus();
    expect(scope.style.paddingBottom).toBe(padding);
    secondary.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(scope.style.paddingBottom).toBe(padding);
    secondary.click();
    vi.runOnlyPendingTimers();
    expect(press).toHaveBeenCalledOnce();
    expect(scope.style.paddingBottom).toBe(padding);
    expect(document.activeElement).toBe(secondary);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(scope.style.paddingBottom).toBe("4px");
    expect(scope.style.maxHeight).toBe("");
    expect(scope.style.overflowY).toBe("");
  });
  it("keeps a keyboard focus handoff inside an overlay stable without retaining a pointer gesture", () => {
    const { scope, input, secondary } = autoDialog();
    dispose = installInputBehavior();
    input.focus();
    flush();
    const padding = scope.style.paddingBottom;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    secondary.focus();
    expect(scope.style.paddingBottom).toBe(padding);
    secondary.blur();
    expect(scope.style.paddingBottom).toBe("4px");
  });
  it("restores document padding after the destination click rather than during its pointer press", () => {
    const { input } = form();
    const action = document.createElement("button");
    document.body.append(action);
    dispose = installInputBehavior();
    input.focus();
    flush();
    const padding = document.documentElement.style.paddingBottom;
    expect(Number.parseFloat(padding)).toBeGreaterThan(0);
    const clicked = vi.fn(() => expect(document.documentElement.style.paddingBottom).toBe(padding));
    action.addEventListener("click", clicked);
    action.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    action.focus();
    expect(document.documentElement.style.paddingBottom).toBe(padding);
    document.dispatchEvent(new Event("pointerup", { bubbles: true }));
    action.click();
    expect(clicked).toHaveBeenCalledOnce();
    vi.runOnlyPendingTimers();
    expect(document.documentElement.style.paddingBottom).toBe("");
  });
  it.each(["pointerup", "pointercancel", "window blur"])(
    "restores a blurred owner's geometry after %s outside the owner",
    (end) => {
      const { scope, input, secondary } = autoDialog();
      dispose = installInputBehavior();
      input.focus();
      flush();
      const padding = scope.style.paddingBottom;
      secondary.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      input.blur();
      expect(scope.style.paddingBottom).toBe(padding);
      if (end === "window blur") window.dispatchEvent(new Event("blur"));
      else document.dispatchEvent(new Event(end, { bubbles: true }));
      expect(scope.style.paddingBottom).toBe(padding);
      vi.runOnlyPendingTimers();
      expect(scope.style.paddingBottom).toBe("4px");
    },
  );
  it("cancels a deferred pointer restoration when the behavior is disposed", () => {
    const { scope, input, secondary } = autoDialog();
    dispose = installInputBehavior();
    input.focus();
    flush();
    secondary.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    input.blur();
    secondary.dispatchEvent(new Event("pointerup", { bubbles: true }));
    document.dispatchEvent(new Event("pointercancel", { bubbles: true }));
    dispose();
    dispose = undefined;
    expect(scope.style.paddingBottom).toBe("4px");
    expect(scope.style.maxHeight).toBe("");
    expect(scope.style.overflowY).toBe("");
    scope.style.paddingBottom = "8px";
    vi.runOnlyPendingTimers();
    flush();
    expect(scope.style.paddingBottom).toBe("8px");
  });
  it("reveals document fields below the actual sticky main header", () => {
    const { input } = form("<div data-form-field><label>Title</label><input></div>");
    const header = document.createElement("nav");
    header.setAttribute("data-app-header", "");
    document.body.prepend(header);
    geometry(header, 0, 96);
    geometry(input.parentElement as HTMLElement, 450, 100);
    geometry(input, 500);
    dispose = installInputBehavior();
    input.focus();
    flush();
    expect(document.documentElement.scrollTo).toHaveBeenLastCalledWith({
      top: 338,
      behavior: "instant",
    });
  });
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
  it("focuses an editable HeroUI date segment instead of its hidden form input or help button", () => {
    const { button, scope } = form(
      '<section class="date-picker" data-form-field aria-invalid="true"><button type="button">Date help</button><input hidden required><span id="day" role="spinbutton" contenteditable="true" tabindex="0">12</span></section><input>',
    );
    dispose = installInputBehavior();
    button.click();
    flush();
    expect(document.activeElement).toBe(scope.querySelector("#day"));
    const segment = scope.querySelector<HTMLElement>("#day");
    segment?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    viewport.dispatchEvent(new Event("resize"));
    flush();
    expect(document.activeElement).toBe(segment);
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
  it("uses the window viewport fallback and restores existing page and result-scope properties", () => {
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("innerHeight", 800);
    const { input, scope } = form("<input><div data-input-results></div>");
    scope.dataset.inputScope = "";
    const results = scope.querySelector<HTMLElement>("[data-input-results]");
    if (!results) throw Error("Missing search results");
    geometry(results, 100, 100);
    document.documentElement.style.setProperty("--app-visible-height", "700px");
    dispose = installInputBehavior();
    input.focus();
    flush();
    expect(scope.style.getPropertyValue("--input-results-height")).toBe("480px");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(scope.style.getPropertyValue("--input-results-height")).toBe("480px");
    expect(document.documentElement.style.getPropertyValue("--app-visible-height")).toBe("800px");
    dispose();
    dispose = undefined;
    expect(scope.style.getPropertyValue("--input-results-height")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--app-visible-height")).toBe("700px");
    document.documentElement.style.removeProperty("--app-visible-height");
  });
  it("ignores document-level submit/invalid events and non-text focus without acquiring a scroll owner", () => {
    const { button } = form("<input>");
    dispose = installInputBehavior();
    button.focus();
    document.dispatchEvent(new Event("submit"));
    document.dispatchEvent(new Event("invalid"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    flush();
    expect(document.activeElement).toBe(button);
    expect(document.documentElement.scrollTo).not.toHaveBeenCalled();
  });
  it("rejects an already selected error field moved into another form before the reveal frame", () => {
    const { button, input } = form();
    dispose = installInputBehavior();
    button.click();
    const firstFrame = [...frames.values()][0];
    frames.clear();
    firstFrame(0);
    const replacement = document.createElement("form");
    document.body.append(replacement);
    replacement.append(input);
    flush();
    expect(document.activeElement).not.toBe(input);
    expect(document.documentElement.scrollTo).not.toHaveBeenCalled();
  });
  it("uses horizontal visual order for invalid fields on the same row", () => {
    const { button, input, scope } = form(
      '<input aria-invalid="true"><textarea aria-invalid="true"></textarea>',
    );
    const textarea = scope.querySelector("textarea");
    if (!textarea) throw Error("Missing second control");
    vi.mocked(input.getBoundingClientRect).mockReturnValue({ ...rect(500), left: 100 });
    dispose = installInputBehavior();
    button.click();
    flush();
    expect(document.activeElement).toBe(textarea);
  });
  it("restores a preexisting error-summary tabindex instead of deleting it", () => {
    const { button, scope } = form('<div data-form-error tabindex="2">Save failed</div><input>');
    const summary = scope.querySelector<HTMLElement>("[data-form-error]");
    if (!summary) throw Error("Missing error summary");
    dispose = installInputBehavior();
    button.click();
    flush();
    expect(document.activeElement).toBe(summary);
    expect(summary.tabIndex).toBe(-1);
    dispose();
    dispose = undefined;
    expect(summary.getAttribute("tabindex")).toBe("2");
  });
  it("removes a temporary results-height property when its unstyled scope is detached", async () => {
    const { input, scope } = form("<input><div data-input-results></div>");
    scope.dataset.inputScope = "";
    const results = scope.querySelector<HTMLElement>("[data-input-results]");
    if (!results) throw Error("Missing search results");
    geometry(results, 400, 100);
    dispose = installInputBehavior();
    input.focus();
    flush();
    expect(scope.style.getPropertyValue("--input-results-height")).not.toBe("");
    scope.remove();
    await mutations();
    expect(scope.style.getPropertyValue("--input-results-height")).toBe("");
  });
});

it("restores a custom autocomplete viewport height when the component route is removed", () => {
  const { input, scope } = form("<input><div data-input-results></div>");
  scope.dataset.inputScope = "";
  scope.style.setProperty("--input-results-height", "120px");
  const results = scope.querySelector<HTMLElement>("[data-input-results]");
  if (!results) throw new Error("Missing autocomplete results");
  geometry(results, 100);
  dispose = installInputBehavior();
  input.focus();
  flush();
  expect(scope.style.getPropertyValue("--input-results-height")).not.toBe("120px");
  dispose();
  dispose = undefined;
  expect(scope.style.getPropertyValue("--input-results-height")).toBe("120px");
});

it("preserves the original error-summary tab stop across repeated validation attempts", () => {
  const { button, scope } = form('<div data-form-error tabindex="4">Save failed</div><input>');
  const summary = scope.querySelector<HTMLElement>("[data-form-error]");
  if (!summary) throw new Error("Missing error summary");
  dispose = installInputBehavior();
  for (let attempt = 0; attempt < 2; attempt++) {
    button.focus();
    button.click();
    flush();
    expect(document.activeElement).toBe(summary);
    expect(summary.tabIndex).toBe(-1);
  }
  dispose();
  dispose = undefined;
  expect(summary.tabIndex).toBe(4);
});

it("keeps focused input stable when an ordinary pointer release schedules no focus restoration", () => {
  const { scope, input, secondary } = autoDialog();
  dispose = installInputBehavior();
  input.focus();
  flush();
  const pinned = scope.style.paddingBottom;
  secondary.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  secondary.dispatchEvent(new Event("pointerup", { bubbles: true }));
  vi.runOnlyPendingTimers();
  expect(document.activeElement).toBe(input);
  expect(scope.style.paddingBottom).toBe(pinned);
  input.blur();
  flush();
  expect(scope.style.paddingBottom).toBe("4px");
});

it("updates search results after an attached picker scope changes without resetting its baseline style", async () => {
  const { scope, input } = form("<input><div data-input-results></div>");
  scope.setAttribute("data-input-scope", "");
  scope.style.setProperty("--input-results-height", "250px");
  const results = scope.querySelector<HTMLElement>("[data-input-results]");
  if (!results) throw new Error("Missing picker results");
  geometry(input, 30);
  geometry(results, 100, 10);
  dispose = installInputBehavior();
  input.focus();
  flush();
  const fitted = scope.style.getPropertyValue("--input-results-height");
  expect(fitted).not.toBe("250px");
  results.append(document.createElement("li"));
  await mutations();
  expect(scope.style.getPropertyValue("--input-results-height")).toBe(fitted);
  scope.remove();
  await mutations();
  expect(scope.style.getPropertyValue("--input-results-height")).toBe("250px");
});
