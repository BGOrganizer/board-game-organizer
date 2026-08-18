"use client";

import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { Button, cn, Link as HeroUILink } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavLinkProps = {
  href: string;
  label: string;
  exact?: boolean;
};

function NavLink({ href, label, exact = false }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  return (
    <HeroUILink>
      <Link
        href={href}
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
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="md:hidden"
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
          <div className="flex items-center gap-3">Board Game Organizer</div>
        </div>
        <Show
          when="signed-in"
          fallback={
            <div className="hidden items-center gap-4 md:flex">
              <SignInButton>
                <Button variant="primary">{t`Sign In`}</Button>
              </SignInButton>
              <SignUpButton>
                <Button variant="outline">{t`Sign Up`}</Button>
              </SignUpButton>
            </div>
          }
        >
          <ul className="hidden items-center gap-4 md:flex">
            {navLinks.map((link) => (
              <li key={link.href}>
                <NavLink href={link.href} label={link.label} />
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <p className="text-sm text-default-500">
              {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress}
            </p>
            <UserButton />
          </div>
        </Show>
      </header>
      {isMenuOpen && (
        <div className="border-t border-separator md:hidden">
          <ul className="flex flex-col gap-2 p-4">
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
                  <NavLink href={link.href} label={link.label} />
                </li>
              ))}
            </Show>
          </ul>
        </div>
      )}
    </nav>
  );
}
