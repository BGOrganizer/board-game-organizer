"use client";

import { getBgoRole } from "@board-game-organizer/schemas";

import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { Button, cn } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ContactRound,
  Dices,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

type NavLinkProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  onClick?: () => void;
};

function NavLink({ href, label, icon: Icon, exact = false, onClick }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact
    ? pathname === href
    : pathname.startsWith(href) || (href === "/groups" && pathname.startsWith("/organizations"));

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
        isActive ? "bg-surface text-accent font-medium" : "text-foreground hover:bg-surface",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}

export function Header() {
  const { user } = useUser();
  const { t } = useLingui();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { href: "/matches", label: t`Matches`, icon: Dices },
    { href: "/groups", label: t`Community`, icon: UsersRound },
    { href: "/events", label: t`Events`, icon: CalendarDays },
    { href: "/contacts", label: t`Contacts`, icon: ContactRound },
    { href: "/profile", label: t`Profile`, icon: UserRound },
  ];

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-separator bg-background/70 backdrop-blur-lg">
      <header className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button
            type="button"
            className="shrink-0 lg:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={t`Toggle menu`}
            aria-expanded={isMenuOpen}
          >
            <span className="sr-only">Menu</span>
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {isMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
          <div className="truncate text-sm font-semibold sm:text-base">Board Game Organizer</div>
        </div>
        <Show
          when="signed-in"
          fallback={
            <div className="hidden items-center gap-3 lg:flex">
              <SignInButton>
                <Button variant="primary">{t`Sign In`}</Button>
              </SignInButton>
              <SignUpButton>
                <Button variant="outline">{t`Sign Up`}</Button>
              </SignUpButton>
            </div>
          }
        >
          <ul className="hidden items-center gap-2 xl:gap-4 lg:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <NavLink href={link.href} label={link.label} icon={link.icon} />
              </li>
            ))}
          </ul>

          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <p className="hidden max-w-40 truncate text-sm text-default-500 sm:block">
              {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress}
            </p>
            <NotificationBell />
            {getBgoRole(user?.publicMetadata) === "ADMIN" ? (
              <Link
                href="/moderation"
                aria-label={t`Organization moderation`}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ShieldCheck className="size-5" aria-hidden="true" />
              </Link>
            ) : null}
            <UserButton />
          </div>
        </Show>
      </header>
      {isMenuOpen && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-separator lg:hidden">
          <ul className="flex flex-col gap-2 p-3 sm:p-4">
            <Show
              when="signed-in"
              fallback={
                <li className="mt-4 flex flex-col gap-2 border-t border-separator pt-4">
                  <SignInButton>
                    <Button variant="primary">{t`Sign In`}</Button>
                  </SignInButton>
                  <SignUpButton>
                    <Button variant="outline">{t`Sign Up`}</Button>
                  </SignUpButton>
                </li>
              }
            >
              {navLinks.map((link) => (
                <li key={link.href}>
                  <NavLink
                    href={link.href}
                    label={link.label}
                    icon={link.icon}
                    onClick={() => setIsMenuOpen(false)}
                  />
                </li>
              ))}
            </Show>
          </ul>
        </div>
      )}
    </nav>
  );
}
