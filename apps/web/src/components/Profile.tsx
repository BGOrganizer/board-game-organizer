"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";


type UserProfile = {
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
    preferredLanguage: string;
    plan: string;
    stats: {
        gamesOwned: number;
        gamesPlayed: number;
        friends: number;
    };
};

function apiUrl(): string {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export function Profile() {
    const { getToken } = useAuth();
    const { user } = useUser();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProfile() {
            try {
                const token = await getToken();
                if (!token) {
                    setError("No auth token");
                    setLoading(false);
                    return;
                }

                console.log("Fetching profile with token:", apiUrl());


                const res = await fetch(`${apiUrl()}/api/profiles`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as UserProfile;
                setProfile(data);
            } catch (e) {
                console.error("Error fetching profile:", e);
                setError(e instanceof Error ? e.message : String(e));
            } finally {
                setLoading(false);
            }
        }

        fetchProfile();
    }, [getToken]);

    if (loading) {
        return (
            <div className="mt-6 flex items-center justify-center">
                <p className="text-default-400">Caricamento...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mt-4 rounded-lg bg-danger-50 p-4">
                <p className="text-sm text-danger">Error: {error}</p>
            </div>
        );
    }

    if (!profile) return null;

    return (
        <div className="rounded-xl border border-divider bg-content1 p-6 shadow-sm">
            <div className="flex items-center gap-4">
                <img
                    src={profile.avatarUrl}
                    alt={profile.name}
                    className="h-16 w-16 rounded-full object-cover"
                />
                <div>
                    <h2 className="text-lg font-semibold">
                        {profile.name}
                    </h2>
                    <p className="text-sm text-default-500">
                        {profile.email}
                    </p>
                </div>
            </div>

            <div className="mt-4 flex gap-6">
                <div>
                    <p className="text-xl font-bold">{profile.stats.gamesOwned}</p>
                    <p className="text-xs text-default-400">Owned</p>
                </div>
                <div>
                    <p className="text-xl font-bold">
                        {profile.stats.gamesPlayed}
                    </p>
                    <p className="text-xs text-default-400">Played</p>
                </div>
                <div>
                    <p className="text-xl font-bold">
                        {profile.stats.friends}
                    </p>
                    <p className="text-xs text-default-400">Friends</p>
                </div>
            </div>

            <p className="mt-3 text-xs text-default-400">
                Plan: {profile.plan} &middot; Language:{" "}
                {profile.preferredLanguage}
            </p>
        </div>
    );
}
