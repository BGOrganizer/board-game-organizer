"use client";

import { Link as HeroUILink, Button, cn } from "@heroui/react";
import Link from 'next/link'
import { Show, UserButton, useUser, SignInButton, SignUpButton } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'

type NavLinkProps = {
    href: string
    label: string
    icon?: React.ReactNode
    exact?: boolean
}

function NavLink({ href, label, icon, exact = false }: NavLinkProps) {
    const pathname = usePathname()
    const isActive = exact ? pathname === href : pathname.startsWith(href)

    return (
        <HeroUILink>


            <Link
                href={href}
                className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md transition-colors',
                    isActive
                        ? 'bg-blue-50 text-blue-600 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                )}
            >
                {/* {icon} */}
                {label}
            </Link>
        </HeroUILink>
    )
}

export function Header() {
    const { user } = useUser();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const router = useRouter()

    return (
        <nav className="sticky top-0 z-40 w-full border-b border-separator bg-background/70 backdrop-blur-lg">
            <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
                <div className="flex items-center gap-4">
                    <button
                        className="md:hidden"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label="Toggle menu"
                        aria-expanded={isMenuOpen}
                    >
                        <span className="sr-only">Menu</span>
                        <svg
                            className="h-6 w-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
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
                    <div className="flex items-center gap-3">
                        Board Game Organizer
                    </div>
                </div>
                <Show when="signed-in" fallback={
                    <div className="hidden items-center gap-4 md:flex">
                        <SignInButton>
                            <Button variant="primary">Sign In</Button>
                        </SignInButton>
                        <SignUpButton>
                            <Button variant="outline">Sign Up</Button>
                        </SignUpButton>
                    </div>
                }>
                    <ul className="hidden items-center gap-4 md:flex">
                        <li>
                            <NavLink href="/matches" label="Matches" />
                        </li>
                        <li>
                            <NavLink href="/groups" label="Groups" />
                        </li>
                        <li>
                            <NavLink href="/organizations" label="Organizations" />
                        </li>                       
                        <li>
                            <NavLink href="/contacts" label="Contacts" />
                        </li>
                        <li>
                            <NavLink href="/profile" label="Profile" />
                        </li>
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

                        <Show when="signed-in" fallback={

                            <li className="mt-4 flex flex-col gap-2 border-t border-separator pt-4">

                                <SignInButton>
                                    <Button variant="primary">Sign In</Button>
                                </SignInButton>
                                <SignUpButton>
                                    <Button variant="outline">Sign Up</Button>
                                </SignUpButton>
                            </li>
                        }>
                            <li>
                                <NavLink href="/matches" label="Matches" />
                            </li>
                            <li>
                                <NavLink href="/groups" label="Groups" />
                            </li>
                            <li>
                                <NavLink href="/organizations" label="Organizations" />
                            </li>
                            <li>
                                <NavLink href="/contacts" label="Contacts" />
                            </li>
                            <li>
                                <NavLink href="/profile" label="Profile" />
                            </li>
                        </Show>

                    </ul>
                </div>
            )}
        </nav>

    )
}