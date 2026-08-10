import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { QueryProvider } from "@board-game-organizer/query";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Follows the OS color scheme (HeroUI v3 uses a `.dark` class on <html>). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap script (no user input) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var m=window.matchMedia('(prefers-color-scheme: dark)');var apply=function(){document.documentElement.classList.toggle('dark',m.matches)};apply();m.addEventListener('change',apply)})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ClerkProvider
          publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
          appearance={clerkAppearance}
        >
          <QueryProvider>{children}</QueryProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
