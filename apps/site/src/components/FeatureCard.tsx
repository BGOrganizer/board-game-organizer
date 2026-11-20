import { Card } from "@heroui/react/card";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function FeatureCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Card className="feature-card">
      <Card.Header>
        <div className="feature-icon">
          <Icon size={22} aria-hidden="true" />
        </div>
        <Card.Title>{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </Card.Header>
      {children ? <Card.Footer>{children}</Card.Footer> : null}
    </Card>
  );
}
