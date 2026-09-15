"use client";

import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { Button, cn, Link as HeroUILink } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NotificationBell } from "@/components/NotificationBell";

type NavLinkProps = {
  href: string;
  label: string;
  exact?: boolean;
  onClick?: () => void;
};

function NavLink({ href, label, exact = false, onClick }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  return (
    <HeroUILink>
      <Link
        href={href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md transition-colors",
          isActive ? "bg-blue-50 text-blue-600 font-medium" : "text-gray-600 hover:bg-gray-100",
        )}
      >
        {label}
      </Link>
    </HeroUILink>
  );
}

export function Header() {
  const { user } = useUser();
  const { t } = useLingui();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { href: "/matches", label: t`Matches` },
    { href: "/groups", label: t`Groups` },
    { href: "/organizations", label: t`Organizations` },
    { href: "/contacts", label: t`Contacts` },
    { href: "/profile", label: t`Profile` },
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
                <NavLink href={link.href} label={link.label} />
              </li>
            ))}
          </ul>

          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <p className="hidden max-w-40 truncate text-sm text-default-500 sm:block">
              {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress}
            </p>
            <NotificationBell />
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
