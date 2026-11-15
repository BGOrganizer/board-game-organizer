const textInput =
  'textarea,input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="reset"])';
const formControl = `${textInput},select`;
const invalidField =
  '[aria-invalid="true"],[data-form-error],input:invalid,textarea:invalid,select:invalid';

function scrollOwner(target: HTMLElement): HTMLElement {
  for (let node = target.parentElement; node; node = node.parentElement) {
    if (
      /(auto|scroll)/.test(getComputedStyle(node).overflowY) ||
      node.matches('[role="dialog"],dialog,[data-input-overlay]')
    )
      return node;
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

/** DOM-only focus behavior; each field uses its real page, list or portal scroll owner. */
export function installInputBehavior() {
  const owners = new Map<
    HTMLElement,
    { inline: string; base: number; extra: number; maxHeight: string; overflowY: string }
  >();
  const resultScopes = new Map<HTMLElement, string>();
  const tabIndices = new Map<HTMLElement, string | null>();
  const isVisible = (target: HTMLElement) =>
    target.isConnected &&
    !target.closest('[hidden],[aria-hidden="true"],[inert]') &&
    getComputedStyle(target).visibility !== "hidden" &&
    target.getClientRects().length > 0;
  function restoreOwners() {
    for (const [owner, saved] of owners) {
      owner.style.paddingBottom = saved.inline;
      owner.style.maxHeight = saved.maxHeight;
      owner.style.overflowY = saved.overflowY;
    }
    owners.clear();
  }
  function cancelErrors() {
    submitted = null;
    clearTimeout(submitTimer);
    version++;
    cancelAnimationFrame(frame);
  }
  const originalHeight = document.documentElement.style.getPropertyValue("--app-visible-height");
  let frame = 0,
    resultsFrame = 0,
    version = 0;
  let submittedSource: string | null = null;
  let submitted: HTMLElement | null = null,
    pinned: HTMLElement | null = null,
    resultsTarget: HTMLElement | null = null;
  let submitTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false,
    settingFocus = false;

  function fitResults(target: HTMLElement, delta = 0) {
    const scope = target.closest<HTMLElement>("[data-input-scope]");
    const results = scope?.querySelector<HTMLElement>("[data-input-results]");
    if (!scope || !results) return;
    if (!resultScopes.has(scope))
      resultScopes.set(scope, scope.style.getPropertyValue("--input-results-height"));
    const owner = scrollOwner(target),
      root = owner === document.documentElement || owner === document.body;
    const visualBottom =
      (window.visualViewport?.offsetTop ?? 0) +
      (window.visualViewport?.height ?? window.innerHeight);
    const bottom = root
      ? visualBottom
      : Math.min(visualBottom, owner.getBoundingClientRect().bottom);
    const room = Math.max(
      96,
      Math.min(window.innerHeight * 0.6, bottom - results.getBoundingClientRect().top + delta - 16),
    );
    scope.style.setProperty("--input-results-height", `${room}px`);
  }
  function reveal(target: HTMLElement, focus = false) {
    const scope = target.closest("[data-form-scope],form");
    const source = scope?.getAttribute("data-form-source");
    const token = ++version;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (
        disposed ||
        token !== version ||
        !isVisible(target) ||
        scope !== target.closest("[data-form-scope],form") ||
        scope?.getAttribute("data-form-source") !== source
      )
        return;
      const owner = scrollOwner(target),
        root = owner === document.documentElement || owner === document.body;
      let saved = owners.get(owner);
      if (!saved) {
        saved = {
          inline: owner.style.paddingBottom,
          base: Number.parseFloat(getComputedStyle(owner).paddingBottom) || 0,
          extra: 0,
          maxHeight: owner.style.maxHeight,
          overflowY: owner.style.overflowY,
        };
        owners.set(owner, saved);
      }
      owner.style.maxHeight = saved.maxHeight;
      owner.style.overflowY = saved.overflowY;
      const viewport = window.visualViewport;
      const ownerRect = owner.getBoundingClientRect();
      const top = Math.max(root ? 0 : ownerRect.top, viewport?.offsetTop ?? 0);
      const visualBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      if (owner.matches('[role="dialog"],dialog,[data-input-overlay]')) {
        const existing = Number.parseFloat(getComputedStyle(owner).maxHeight);
        owner.style.maxHeight = `${Math.max(44, Math.min(Number.isFinite(existing) ? existing : Number.POSITIVE_INFINITY, visualBottom - top - 16))}px`;
        owner.style.overflowY = "auto";
      }
      const availableControl = (control: HTMLElement) =>
        isVisible(control) && !control.matches(':disabled,[aria-disabled="true"],[readonly]');
      const controls = [target, ...target.querySelectorAll<HTMLElement>(formControl)].filter(
        (control) => control.matches(formControl) && availableControl(control),
      );
      const field =
        controls.find((control) => control.matches('[aria-invalid="true"],:invalid')) ??
        controls[0] ??
        [target, ...target.querySelectorAll<HTMLElement>("[data-form-control]")].find(
          (control) => control.matches("[data-form-control]") && availableControl(control),
        );
      const group =
        target.closest<HTMLElement>("[data-form-field]") ??
        target.closest<HTMLElement>(".text-field,.search-field") ??
        target;
      const fieldRect = (field ?? target).getBoundingClientRect(),
        groupRect = group.getBoundingClientRect();
      const available =
        Math.min(visualBottom, root ? visualBottom : owner.getBoundingClientRect().bottom) - top;
      const labelFits = fieldRect.bottom - groupRect.top <= available - 32;
      const gap = labelFits ? 16 : Math.min(32, Math.max(0, available - fieldRect.height - 16));
      const offset = Math.max(
        0,
        owner.scrollTop + (labelFits ? groupRect.top : fieldRect.top) - top - gap,
      );
      const delta = offset - owner.scrollTop;
      const naturalHeight = owner.scrollHeight - saved.extra;
      saved.extra = Math.max(0, offset + owner.clientHeight - naturalHeight);
      owner.style.paddingBottom = `${saved.base + saved.extra}px`;
      fitResults(field ?? target, delta);
      if (typeof owner.scrollTo === "function")
        owner.scrollTo({ top: offset, behavior: "instant" });
      else owner.scrollTop = offset;
      if (focus) {
        pinned = field ?? target;
        resultsTarget = pinned;
        settingFocus = true;
        if (field) field.focus({ preventScroll: true });
        else {
          if (!tabIndices.has(target)) tabIndices.set(target, target.getAttribute("tabindex"));
          target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }
        settingFocus = false;
      }
    });
  }
  function firstError() {
    if (!submitted?.isConnected) return;
    if (submitted.getAttribute("data-form-source") !== submittedSource) {
      cancelErrors();
      return;
    }
    const target = [...submitted.querySelectorAll<HTMLElement>(invalidField)]
      .filter((field) => isVisible(field) && !field.matches(':disabled,[aria-disabled="true"]'))
      .sort((a, b) => {
        const first = a.getBoundingClientRect(),
          second = b.getBoundingClientRect();
        return first.top - second.top || first.left - second.left;
      })[0];
    if (target) {
      submitted = null;
      clearTimeout(submitTimer);
      reveal(target.closest<HTMLElement>("[data-form-field]") ?? target, true);
    }
  }
  function focus(event: FocusEvent) {
    if (settingFocus) return;
    cancelErrors();
    if (event.target instanceof HTMLElement && event.target.matches(textInput)) {
      pinned = event.target;
      resultsTarget = pinned;
      reveal(event.target);
    }
  }
  function blur() {
    if (settingFocus) return;
    pinned = null;
    resultsTarget = null;
    version++;
    cancelAnimationFrame(frame);
    restoreOwners();
  }
  function queueErrors(scope: HTMLElement | null) {
    cancelErrors();
    submitted = scope;
    submittedSource = scope?.getAttribute("data-form-source") ?? null;
    if (!scope) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(firstError);
    submitTimer = setTimeout(cancelErrors, 500);
  }
  function click(event: MouseEvent) {
    const button =
      event.target instanceof Element ? event.target.closest("[data-form-submit]") : null;
    if (button?.matches(':disabled,[aria-disabled="true"]')) return;
    queueErrors(button?.closest<HTMLElement>("[data-form-scope],form") ?? null);
  }
  function submit(event: Event) {
    queueErrors(
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-form-scope],form")
        : null,
    );
  }
  function input() {
    cancelErrors();
    if (pinned?.isConnected) reveal(pinned);
  }
  function invalid(event: Event) {
    if (event.target instanceof HTMLElement)
      queueErrors(event.target.closest<HTMLElement>("[data-form-scope],form"));
  }
  function manual(event: Event) {
    if (
      event instanceof KeyboardEvent &&
      (!["PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp", " "].includes(event.key) ||
        (event.target instanceof Element && event.target.matches(textInput)))
    )
      return;
    pinned = null;
    resultsTarget = null;
    cancelErrors();
  }
  function viewport() {
    document.documentElement.style.setProperty(
      "--app-visible-height",
      `${window.visualViewport?.height ?? window.innerHeight}px`,
    );
    if (pinned?.isConnected && document.activeElement === pinned) reveal(pinned);
    else if (resultsTarget?.isConnected) fitResults(resultsTarget);
  }
  const observer = new MutationObserver(() => {
    for (const [owner, saved] of owners) {
      if (owner.isConnected) continue;
      owner.style.paddingBottom = saved.inline;
      owner.style.maxHeight = saved.maxHeight;
      owner.style.overflowY = saved.overflowY;
      owners.delete(owner);
    }
    for (const [scope, original] of resultScopes) {
      if (scope.isConnected) continue;
      if (original) scope.style.setProperty("--input-results-height", original);
      else scope.style.removeProperty("--input-results-height");
      resultScopes.delete(scope);
    }
    if (pinned && !isVisible(pinned)) blur();
    if (submitted) firstError();
    cancelAnimationFrame(resultsFrame);
    if (pinned?.isConnected)
      resultsFrame = requestAnimationFrame(() => {
        if (!disposed && pinned?.isConnected) reveal(pinned);
      });
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "aria-invalid",
      "data-form-error",
      "data-form-source",
      "hidden",
      "inert",
      "aria-hidden",
    ],
  });
  document.addEventListener("focusin", focus);
  document.addEventListener("focusout", blur);
  document.addEventListener("pointerdown", cancelErrors, true);
  document.addEventListener("touchstart", cancelErrors, { capture: true, passive: true });
  document.addEventListener("click", click, true);
  document.addEventListener("submit", submit, true);
  document.addEventListener("input", input, true);
  document.addEventListener("invalid", invalid, true);
  document.addEventListener("wheel", manual, { capture: true, passive: true });
  document.addEventListener("touchmove", manual, { capture: true, passive: true });
  document.addEventListener("keydown", manual, true);
  window.visualViewport?.addEventListener("resize", viewport);
  window.visualViewport?.addEventListener("scroll", viewport);
  window.addEventListener("resize", viewport);
  viewport();
  return () => {
    disposed = true;
    version++;
    clearTimeout(submitTimer);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(resultsFrame);
    observer.disconnect();
    document.removeEventListener("focusin", focus);
    document.removeEventListener("focusout", blur);
    document.removeEventListener("pointerdown", cancelErrors, true);
    document.removeEventListener("touchstart", cancelErrors, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("submit", submit, true);
    document.removeEventListener("input", input, true);
    document.removeEventListener("invalid", invalid, true);
    document.removeEventListener("wheel", manual, true);
    document.removeEventListener("touchmove", manual, true);
    document.removeEventListener("keydown", manual, true);
    window.visualViewport?.removeEventListener("resize", viewport);
    window.visualViewport?.removeEventListener("scroll", viewport);
    window.removeEventListener("resize", viewport);
    restoreOwners();
    for (const [target, original] of tabIndices) {
      if (original === null) target.removeAttribute("tabindex");
      else target.setAttribute("tabindex", original);
    }
    for (const [scope, original] of resultScopes) {
      if (original) scope.style.setProperty("--input-results-height", original);
      else scope.style.removeProperty("--input-results-height");
    }
    if (originalHeight)
      document.documentElement.style.setProperty("--app-visible-height", originalHeight);
    else document.documentElement.style.removeProperty("--app-visible-height");
  };
}
