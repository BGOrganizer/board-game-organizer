import {
    SignInButton,
    SignUpButton,

} from "@clerk/nextjs";

import { Button } from '@heroui/react';

export function LoginFallback() {

    return (

        <div className="flex flex-col items-center gap-6 pt-16 text-center">
            <h2 className="text-2xl font-bold">
                Benvenuto in Board Game Organizer
            </h2>
            <p className="max-w-md text-default-500">
                Organizza la tua collezione di giochi da tavolo, tieni traccia
                delle partite e connettiti con altri giocatori.
            </p>
            <div className="flex gap-3">
                <SignInButton mode="modal">
                    <Button>Sign In</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                    <Button variant="outline">Sign Up</Button>
                </SignUpButton>
            </div>
        </div>
    )
}