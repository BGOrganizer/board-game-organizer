"use client";

import { Card } from "@heroui/react";
import type { ReactNode } from "react";

export function InviteShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      style={{
        boxSizing: "border-box",
        width: "100%",
        maxWidth: 640,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <Card>
        <Card.Header>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>{title}</h1>
        </Card.Header>
        <Card.Content style={{ display: "grid", gap: 16 }}>{children}</Card.Content>
        <Card.Footer style={{ color: "var(--muted)", fontSize: 13 }}>
          Board Game Organizer
        </Card.Footer>
      </Card>
    </main>
  );
}
