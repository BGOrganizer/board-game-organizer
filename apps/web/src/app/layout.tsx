import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
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
    <html lang="en" className="light">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ClerkProvider
          publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
          appearance={clerkAppearance}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}