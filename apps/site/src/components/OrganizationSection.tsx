"use client";

import { CalendarClock, CircleCheck, Dices, Globe, LockKeyhole, UsersRound } from "lucide-react";
import type { SiteCopy } from "../lib/copy";
import { ResourcePreviewCard } from "./ResourcePreviewCard";

export function OrganizationSection({ copy }: { copy: SiteCopy }) {
  return (
    <section id="organizzazioni" className="shell organizations" aria-labelledby="org-title">
      <div className="section-heading">
        <p className="eyebrow">{copy.organizationsEyebrow}</p>
        <h2 id="org-title">{copy.organizationsHeading}</h2>
        <p className="section-intro">{copy.organizationsDescription}</p>
      </div>
      <div className="organization-grid">
        <div className="organization-demo">
          <div className="demo-label">
            <UsersRound size={16} aria-hidden="true" /> {copy.publicGroup}
          </div>
          <ResourcePreviewCard
            kind="group"
            title={copy.groupName}
            indicators={[
              {
                label: copy.publicGroup,
                icon: Globe,
                tone: "accent",
                description: copy.groupDescription,
              },
              {
                label: copy.approved,
                icon: CircleCheck,
                tone: "success",
                description: copy.approvedDescription,
              },
            ]}
          >
            <p>
              <UsersRound size={15} aria-hidden="true" /> {copy.memberCount}
            </p>
            <p>{copy.eventCount}</p>
          </ResourcePreviewCard>
          <p className="organization-note">{copy.groupTagline}</p>
        </div>
        <div className="organization-demo">
          <div className="demo-label">
            <Globe size={16} aria-hidden="true" /> {copy.publicEvent}
          </div>
          <ResourcePreviewCard
            kind="publicEvent"
            title={copy.publicEventName}
            indicators={[
              {
                label: copy.publicEvent,
                icon: Globe,
                tone: "accent",
                description: copy.publicEventDescription,
              },
              {
                label: copy.planning,
                icon: CalendarClock,
                tone: "warning",
                description: copy.planningDescription,
              },
            ]}
          >
            <p>
              <UsersRound size={15} aria-hidden="true" /> {copy.groupName}
            </p>
            <p>
              <Dices size={15} aria-hidden="true" /> {copy.publicTables}
            </p>
          </ResourcePreviewCard>
          <p className="organization-note">{copy.publicEventTagline}</p>
        </div>
        <div className="organization-demo">
          <div className="demo-label">
            <LockKeyhole size={16} aria-hidden="true" /> {copy.privateEvent}
          </div>
          <ResourcePreviewCard
            kind="privateEvent"
            title={copy.privateEventName}
            indicators={[
              {
                label: copy.privateEvent,
                icon: LockKeyhole,
                description: copy.privateEventDescription,
              },
              {
                label: copy.planning,
                icon: CalendarClock,
                tone: "warning",
                description: copy.planningDescription,
              },
            ]}
          >
            <p>
              <UsersRound size={15} aria-hidden="true" /> {copy.groupName}
            </p>
            <p>
              <Dices size={15} aria-hidden="true" /> {copy.privateTables}
            </p>
          </ResourcePreviewCard>
          <p className="organization-note">{copy.privateEventTagline}</p>
        </div>
      </div>
    </section>
  );
}
