"use client";

import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Tabs } from "@heroui/react/tabs";
import { ArrowUpRight, Globe2, LockKeyhole, TrendingUp, Trophy } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { Locale, SiteCopy } from "../lib/copy";
import type { ArtworkSources } from "./ArtworkPicture";
import { ArtworkPicture } from "./ArtworkPicture";

const dadoMotion = "/artwork/player-dadoazzurro-animated.svg";
const dadoAvatar = "/artwork/player-dadoazzurro.svg";
const meepleMotion = "/artwork/player-meepleverde-animated.svg";
const meepleAvatar = "/artwork/player-meepleverde.svg";
const tavoloMotion = "/artwork/player-tablerosa-animated.svg";
const tavoloAvatar = "/artwork/player-tablerosa.svg";
const hegemonyCover = "/images/hegemony-bgg.webp";

const game = "Hegemony";
const gamePage = "https://boardgamegeek.com/boardgame/321608/hegemony-lead-your-class-to-victory";
const ratingHistory = {
  group: [22.5, 24.1, 23.4, 27, 28.6, 31.7],
  global: [22.5, 24.4, 23.8, 26.3, 25.5, 27.4, 29.8, 29.1, 30.8],
} as const;
const groupScores = ratingHistory.group;
const players = [
  {
    name: "@meepleverde",
    avatar: [meepleAvatar, meepleMotion],
    score: groupScores[groupScores.length - 1],
  },
  { name: "@tablerosa", avatar: [tavoloAvatar, tavoloMotion], score: 28.2 },
  { name: "@dadoazzurro", avatar: [dadoAvatar, dadoMotion], score: 26.4 },
] satisfies { name: string; avatar: ArtworkSources; score: number }[];
type Scope = keyof typeof ratingHistory;

function RatingProgress({
  copy,
  scope,
  number,
}: {
  copy: SiteCopy;
  scope: Scope;
  number: Intl.NumberFormat;
}) {
  const scores = ratingHistory[scope];
  const score = scores[scores.length - 1];
  const scaleY = (rating: number) => 105 - ((rating - 20) / 15) * 90;
  const points = scores.map((rating, index) => ({
    x: 29 + (index * 297) / (scores.length - 1),
    y: scaleY(rating),
  }));
  const scopeLabel = scope === "group" ? copy.privateRanking : copy.globalRanking;
  const pointsString = points.map(({ x, y }) => `${x},${y}`).join(" ");
  return (
    <Card className="rank-progress">
      <Card.Header>
        <div className="progress-heading">
          <Card.Title>{copy.progressTitle}</Card.Title>
          <Chip size="sm" variant="soft" color="accent">
            {scopeLabel}
          </Chip>
        </div>
        <div className="progress-player" aria-live="polite">
          <ArtworkPicture artwork={players[0].avatar} size={28} className="rank-avatar" />
          <span>
            {players[0].name} <span className="progress-game">· {game}</span>
          </span>
          <strong>{number.format(score)}</strong>
        </div>
      </Card.Header>
      <Card.Content>
        <svg
          className="rating-chart"
          viewBox="0 0 340 115"
          role="img"
          aria-label={`${copy.progressTitle} · ${scopeLabel} · ${game}`}
        >
          <desc>{`${copy.ratedGames}: ${scores.map((rating) => number.format(rating)).join("; ")}`}</desc>
          {[35, 30, 25, 20].map((tick) => (
            <g key={tick}>
              <line x1="29" x2="326" y1={scaleY(tick)} y2={scaleY(tick)} />
              <text x="2" y={scaleY(tick) + 4}>
                {tick}
              </text>
            </g>
          ))}
          <polygon points={`29,105 ${pointsString} 326,105`} />
          <polyline points={pointsString} />
          {points.map(({ x, y }) => (
            <circle key={x} cx={x} cy={y} r="3" />
          ))}
        </svg>
        <div className="rating-chart-legend">
          <span>1</span>
          <span>{copy.ratedGames}</span>
          <span>{scores.length}</span>
        </div>
      </Card.Content>
    </Card>
  );
}

export function RankingSection({ copy, locale }: { copy: SiteCopy; locale: Locale }) {
  const [scope, setScope] = useState<Scope>("group");
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const globalScores = ratingHistory.global;
  return (
    <section id="classifiche" className="shell ranking-section" aria-labelledby="rank-title">
      <Card className="rank-feature">
        <div className="rank-copy">
          <div className="feature-icon">
            <Trophy size={22} aria-hidden="true" />
          </div>
          <p className="eyebrow">OpenSkill</p>
          <h2 id="rank-title">{copy.rating}</h2>
          <p className="rank-description">{copy.ratingDescription}</p>
          <div className="rank-notes">
            <div>
              <LockKeyhole size={17} aria-hidden="true" /> <p>{copy.privateText}</p>
            </div>
            <div>
              <Globe2 size={17} aria-hidden="true" /> <p>{copy.globalText}</p>
            </div>
          </div>
        </div>
        <Card className="ranking-board">
          <Card.Header className="ranking-board-header">
            <a className="rank-game" href={gamePage}>
              <Image src={hegemonyCover} width={38} height={38} alt="" />
              <strong>{game}</strong>
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <Chip size="sm" variant="secondary">
              {copy.sample}
            </Chip>
          </Card.Header>
          <Card.Content>
            <Tabs
              selectedKey={scope}
              onSelectionChange={(key) => setScope(key === "global" ? "global" : "group")}
            >
              <Tabs.ListContainer className="ranking-tabs">
                <Tabs.List aria-label={copy.exampleRanking}>
                  <Tabs.Tab id="group">
                    <LockKeyhole size={15} aria-hidden="true" /> {copy.privateRanking}{" "}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="global">
                    <Globe2 size={15} aria-hidden="true" /> {copy.globalRanking} <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id="group" className="ranking-panel">
                <p className="sample-caption">
                  {copy.classDescription} · {copy.groupName}
                </p>
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="sr-only">{copy.position}</span>#
                      </th>
                      <th scope="col">{copy.player}</th>
                      <th scope="col">{copy.score}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player, index) => (
                      <tr key={player.name}>
                        <td>{index + 1}</td>
                        <td>
                          <ArtworkPicture
                            artwork={player.avatar}
                            size={28}
                            className="rank-avatar"
                          />
                          {player.name}
                        </td>
                        <td>{number.format(player.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Tabs.Panel>
              <Tabs.Panel id="global" className="ranking-panel">
                <p className="sample-caption">{copy.profileDescription}</p>
                <div className="global-score">
                  <ArtworkPicture artwork={players[0].avatar} size={28} className="rank-avatar" />
                  <div>
                    <strong>{players[0].name}</strong>
                    <p>{game} · OpenSkill</p>
                  </div>
                  <strong className="global-number">
                    {number.format(globalScores[globalScores.length - 1])}
                  </strong>
                </div>
              </Tabs.Panel>
            </Tabs>
          </Card.Content>
        </Card>
        <RatingProgress copy={copy} scope={scope} number={number} />
        <div className="rank-progress-copy">
          <div className="feature-icon">
            <TrendingUp size={21} aria-hidden="true" />
          </div>
          <h3>{copy.progressHeading}</h3>
          <div className="rank-notes">
            <div>
              <LockKeyhole size={16} aria-hidden="true" /> <p>{copy.progressGroup}</p>
            </div>
            <div>
              <Globe2 size={16} aria-hidden="true" /> <p>{copy.progressGlobal}</p>
            </div>
          </div>
        </div>
        <p className="rank-description rank-progress-explainer">{copy.progressDescription}</p>
      </Card>
    </section>
  );
}
