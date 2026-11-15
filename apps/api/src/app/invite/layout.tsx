import type { ReactNode } from "react";
import "./invite.css";

export default function InviteLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
