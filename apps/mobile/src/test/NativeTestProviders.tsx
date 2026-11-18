import { createRequire } from "node:module";
import { I18nProvider } from "@lingui/react";
import { HeroUINativeProvider } from "heroui-native/provider";
import { type ReactNode, useMemo } from "react";
import { createAppI18n } from "@/lib/i18n";

// Native-owned HeroUI uses this CommonJS instance; share its actual context.
const { SafeAreaProvider } = createRequire(import.meta.url)(
  "react-native-safe-area-context",
) as typeof import("react-native-safe-area-context");

export function NativeTestProviders({
  children,
  locale = "en",
}: {
  children: ReactNode;
  locale?: "en" | "it";
}) {
  const i18n = useMemo(() => createAppI18n(locale), [locale]);
  return (
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
        }}
      >
        <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
          {children}
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </I18nProvider>
  );
}
