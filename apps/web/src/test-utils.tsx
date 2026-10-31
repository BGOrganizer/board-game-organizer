import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReactElement } from "react";

const router = {
  bfcacheId: "unit-test",
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

import { messages } from "../../../messages/en.js";

/**
 * Renders a component inside a Lingui I18nProvider preloaded with the English
 * catalog — required because the Lingui macro transform (`useLingui`/`t`) is
 * applied by @lingui/vite-plugin, but the runtime still needs an active i18n
 * instance.
 */
export function renderWithI18n(ui: ReactElement) {
  const i18n = setupI18n({ locale: "en", messages: { en: messages } });
  const wrap = (value: ReactElement) => (
    <AppRouterContext.Provider value={router}>
      <I18nProvider i18n={i18n}>{value}</I18nProvider>
    </AppRouterContext.Provider>
  );
  const view = render(wrap(ui));
  return {
    ...view,
    rerender: (next: ReactElement) => view.rerender(wrap(next)),
  };
}
