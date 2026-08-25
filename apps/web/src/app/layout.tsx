import { QueryProvider } from "@board-game-organizer/query";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { LinguiClientProvider } from "@/components/LinguiClientProvider";
import { ThemeScript } from "@/components/ThemeScript";
import { initServerI18n } from "@/lib/i18n";
import "./globals.css";

const clerkAppearance = {
  variables: {
    colorPrimary: "#006fee",
    colorDanger: "#f31260",
    borderRadius: "0.5rem",
  },
  elements: {
    card: "shadow-xl rounded-xl",
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
        >
          <QueryProvider>
            <LinguiClientProvider initialLocale={locale} initialMessages={messages}>
              {children}
            </LinguiClientProvider>
          </QueryProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
