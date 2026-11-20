import { Chip } from "@heroui/react/chip";
import { Link } from "@heroui/react/link";
import { buttonVariants } from "@heroui/styles/components/button";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CodeXml,
  Globe2,
  Hand,
  HeartHandshake,
  LibraryBig,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { type Locale, translations } from "../lib/copy";
import { latestRelease, license, repository, webSignInUrl } from "../lib/links";
import { ArtworkMotionProvider } from "./ArtworkMotionProvider";
import { EventFormats } from "./EventFormats";
import { FeatureCard } from "./FeatureCard";
import { HeroScene } from "./HeroScene";
import { OrganizationSection } from "./OrganizationSection";
import { RankingSection } from "./RankingSection";

const mascot = "/images/mascot.webp";
const appIcon = "/images/app-icon.webp";
const bggLogo = "/images/bgg-powered.png";

function ActionLink({
  children,
  href,
  size = "md",
  variant = "primary",
}: {
  children: ReactNode;
  href: string;
  size?: "md" | "lg";
  variant?: "primary" | "outline";
}) {
  return (
    <Link href={href} className={buttonVariants({ size, variant, className: "action-link" })}>
      {children}
    </Link>
  );
}

function LoginLink({
  children,
  href,
  size = "md",
}: {
  children: ReactNode;
  href: string;
  size?: "md" | "lg";
}) {
  return (
    <ActionLink size={size} href={href}>
      {children}
      <ArrowUpRight aria-hidden="true" />
    </ActionLink>
  );
}

export function Site({ locale }: { locale: Locale }) {
  const copy = translations[locale];
  const signIn = webSignInUrl();
  const languageHref = locale === "it" ? "/en" : "/";
  return (
    <ArtworkMotionProvider>
      <a className="skip-link" href="#main">
        {copy.skip}
      </a>
      <header className="site-header">
        <div className="shell header-row">
          <a className="wordmark" href="#top" aria-label={copy.home}>
            <Image src={mascot} alt="" width={42} height={42} />
            <span>
              Board Game
              <br />
              Organizer
            </span>
          </a>
          <nav className="header-nav" aria-label={copy.nav}>
            <a href="#eventi">{copy.eventsNav}</a>
            <a href="#funzionalita">{copy.features}</a>
            <a href="#classifiche">{copy.ranking}</a>
            <a href="#community">{copy.community}</a>
          </nav>
          <LoginLink href={signIn}>{copy.login}</LoginLink>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <section className="shell hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="values">
              <div className="value-row">
                <Chip color="accent" variant="soft" size="sm">
                  {copy.free}
                </Chip>
                <Chip variant="secondary" size="sm">
                  {copy.open}
                </Chip>
                <Chip variant="secondary" size="sm">
                  {copy.madeBy}
                </Chip>
              </div>
              <div className="value-row">
                <Chip variant="secondary" size="sm">
                  {copy.groupsAndEvents}
                </Chip>
                <Chip variant="secondary" size="sm">
                  BoardGameGeek
                </Chip>
                <Chip variant="secondary" size="sm">
                  {copy.openSkillRating}
                </Chip>
              </div>
            </div>
            <h1 id="hero-title">
              {copy.headline[0]}
              <br />
              <span>{copy.headline[1]}</span>
            </h1>
            <p>{copy.intro}</p>
            <div className="hero-actions">
              <LoginLink size="lg" href={signIn}>
                {copy.openApp}
              </LoginLink>
              <ActionLink size="lg" variant="outline" href={latestRelease}>
                <Image className="apk-icon" src={appIcon} alt="" width={22} height={22} />
                {copy.downloadApk}
              </ActionLink>
            </div>
          </div>
          <HeroScene copy={copy} />
        </section>
        <EventFormats copy={copy} />
        <OrganizationSection copy={copy} />
        <section id="funzionalita" className="shell features" aria-labelledby="features-title">
          <div className="section-heading">
            <p className="eyebrow">{copy.features}</p>
            <h2 id="features-title">{copy.featureHeading}</h2>
          </div>
          <div className="feature-grid">
            <FeatureCard icon={CalendarDays} title={copy.plan} description={copy.planDescription} />
            <FeatureCard icon={UsersRound} title={copy.table} description={copy.tableDescription}>
              <ul className="planning-modes">
                <li>
                  <span className="planning-icon">
                    <Hand size={15} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{copy.manualPlanning}</strong>
                    <span>{copy.manualPlanningDescription}</span>
                  </span>
                </li>
                <li>
                  <span className="planning-icon">
                    <Sparkles size={15} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{copy.assistedPlanning}</strong>
                    <span>{copy.assistedPlanningDescription}</span>
                  </span>
                </li>
              </ul>
            </FeatureCard>
            <FeatureCard icon={LibraryBig} title={copy.bgg} description={copy.bggDescription}>
              <a href="https://boardgamegeek.com/" className="bgg-link">
                <Image
                  src={bggLogo}
                  alt="Powered by BoardGameGeek"
                  width={1104}
                  height={324}
                  sizes="150px"
                />
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </FeatureCard>
          </div>
        </section>
        <RankingSection copy={copy} locale={locale} />
        <section id="community" className="shell community" aria-labelledby="community-title">
          <div className="community-copy">
            <div className="feature-icon">
              <HeartHandshake size={23} aria-hidden="true" />
            </div>
            <div>
              <h2 id="community-title">{copy.communityHeading}</h2>
              <p>{copy.communityDescription}</p>
            </div>
          </div>
          <ActionLink size="lg" variant="outline" href={repository}>
            <CodeXml aria-hidden="true" /> {copy.repository} <ArrowRight aria-hidden="true" />
          </ActionLink>
        </section>
      </main>
      <footer className="site-footer">
        <div className="shell footer-row">
          <span className="footer-brand">Board Game Organizer</span>
          <div>
            <a href={license}>{copy.license}</a>
            <a href={repository}>GitHub</a>
            <a
              className="language-link"
              href={languageHref}
              aria-label={copy.language}
              hrefLang={locale === "it" ? "en" : "it"}
            >
              <Globe2 size={16} aria-hidden="true" /> {locale === "it" ? "EN" : "IT"}
            </a>
          </div>
        </div>
      </footer>
    </ArtworkMotionProvider>
  );
}
