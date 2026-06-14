import type { Metadata } from "next";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
