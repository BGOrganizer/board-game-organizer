import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { InputBehavior } from "@/components/common/providers/InputBehavior";
import { LinguiClientProvider } from "@/components/common/providers/LinguiClientProvider";
import { SessionQueryProvider } from "@/components/common/providers/SessionQueryProvider";
import { ThemeScript } from "@/components/common/providers/ThemeScript";
import { initServerI18n } from "@/lib/i18n";
import "./globals.css";

const clerkAppearance = {
  variables: {
    colorPrimary: "var(--accent)",
    colorPrimaryForeground: "var(--accent-foreground)",
    colorDanger: "var(--danger)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--warning)",
    colorBackground: "var(--overlay)",
    colorForeground: "var(--overlay-foreground)",
    colorInput: "var(--field-background)",
    colorInputForeground: "var(--field-foreground)",
    colorMuted: "var(--default)",
    colorMutedForeground: "var(--muted)",
    colorBorder: "var(--border)",
    colorRing: "var(--focus)",
    colorModalBackdrop: "var(--backdrop)",
    borderRadius: "0.5rem",
  },
  elements: {
    card: "shadow-overlay rounded-xl",
  },
};

export const metadata: Metadata = {
  title: "Board Game Organizer",
  description: "Organize your board game collection",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Detect the browser locale (Accept-Language), load its catalog and register
  // the server i18n instance; also returns the locale for <html lang> and the
  // client provider (which receives the serializable messages).
  const { locale, messages } = await initServerI18n();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeScript />
        <ClerkProvider
          publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
          appearance={clerkAppearance}
          signUpForceRedirectUrl="/mobile-number"
        >
          <SessionQueryProvider>
            <LinguiClientProvider initialLocale={locale} initialMessages={messages}>
              <InputBehavior />
              {children}
            </LinguiClientProvider>
          </SessionQueryProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
