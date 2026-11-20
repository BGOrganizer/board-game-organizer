"use client";

import { Button } from "@heroui/react/button";
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  Clock3,
  Dices,
  MapPin,
  Pause,
  Play,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import { useContext } from "react";
import type { SiteCopy } from "../lib/copy";
import { ArtworkMotion } from "./ArtworkPicture";
import { ResourcePreviewCard } from "./ResourcePreviewCard";

const mascot = "/images/mascot.webp";
const azulCover = "/images/azul-bgg.png";
const exampleGame = "Azul";
const exampleGamePage = "https://boardgamegeek.com/boardgame/230802/azul";

export function HeroScene({ copy }: { copy: SiteCopy }) {
  const { enabled, toggle } = useContext(ArtworkMotion);
  const motionLabel = enabled ? copy.pauseArtwork : copy.resumeArtwork;
  return (
    <div className="hero-scene dark" data-theme="dark">
      <div className="scene-heading">
        <span>
          <Dices aria-hidden="true" /> {copy.next}
        </span>
        <div className="scene-actions">
          <span className="scene-example">{copy.sample}</span>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            className="motion-toggle"
            aria-label={motionLabel}
            onPress={toggle}
          >
            {enabled ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
      <div className="scene-orbit" aria-hidden="true" />
      <Image
        src={mascot}
        alt=""
        className="scene-mascot"
        width={840}
        height={840}
        sizes="(max-width: 690px) 76vw, 420px"
        fetchPriority="high"
      />
      <div className="scene-card light" data-theme="light">
        <ResourcePreviewCard
          kind="table"
          title={copy.tableName}
          indicators={[
            {
              label: copy.confirmed,
              icon: CalendarCheck,
              tone: "success",
              description: copy.confirmedDescription,
            },
            {
              label: copy.chosenVenue,
              icon: MapPin,
              tone: "success",
              description: (
                <p className="preview-detail">
                  <MapPin size={16} aria-hidden="true" /> {copy.venue}
                </p>
              ),
            },
            {
              label: copy.chosenDate,
              icon: CalendarDays,
              tone: "success",
              description: (
                <div className="preview-schedule">
                  <span className="preview-detail">
                    <CalendarDays size={16} aria-hidden="true" />
                    <time dateTime="2026-12-18">{copy.date}</time>
                  </span>
                  <span className="preview-detail">
                    <Clock3 size={16} aria-hidden="true" />
                    <span className="sr-only">{copy.startTime}</span>
                    <time dateTime="20:30">{copy.time}</time>
                  </span>
                </div>
              ),
            },
            {
              label: copy.chosenGame,
              icon: Dices,
              tone: "accent",
              description: (
                <a className="preview-game" href={exampleGamePage}>
                  <Image src={azulCover} alt="" width={48} height={48} />
                  <span>
                    <strong>{exampleGame}</strong>
                    <small>
                      BoardGameGeek <ArrowUpRight size={13} aria-hidden="true" />
                    </small>
                  </span>
                </a>
              ),
            },
          ]}
        >
          <p>
            <UsersRound size={15} aria-hidden="true" /> {copy.seats}
          </p>
        </ResourcePreviewCard>
      </div>
    </div>
  );
}
