import { Card } from "@heroui/react/card";
import { ArrowDownRight, Globe, LockKeyhole, Zap } from "lucide-react";
import type { SiteCopy } from "../lib/copy";

export function EventFormats({ copy }: { copy: SiteCopy }) {
  const formats = [
    { title: copy.quickMode, description: copy.quickModeDescription, Icon: Zap },
    { title: copy.privateMode, description: copy.privateModeDescription, Icon: LockKeyhole },
    { title: copy.publicMode, description: copy.publicModeDescription, Icon: Globe },
  ];

  return (
    <section id="eventi" className="shell event-formats" aria-labelledby="formats-title">
      <div className="section-heading">
        <p className="eyebrow">{copy.eventsNav}</p>
        <h2 id="formats-title">{copy.eventFormatsHeading}</h2>
      </div>
      <div className="event-formats-grid">
        {formats.map(({ title, description, Icon }) => (
          <Card className="event-format-card" key={title}>
            <Card.Header>
              <span className="feature-icon">
                <Icon size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <Card.Title>{title}</Card.Title>
                <Card.Description>{description}</Card.Description>
              </div>
            </Card.Header>
          </Card>
        ))}
      </div>
      <a className="event-formats-link" href="#organizzazioni">
        {copy.associationsLink} <ArrowDownRight size={15} aria-hidden="true" />
      </a>
    </section>
  );
}
