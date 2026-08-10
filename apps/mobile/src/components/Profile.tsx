
import { useAuth, useUser } from "@clerk/expo";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

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
    return Constants.expoConfig?.extra?.apiUrl ?? "http://127.0.0.1:4000";
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
            <View className="mt-6 items-center">
                <Text className="text-default-400">Caricamento...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View className="mt-4 rounded-lg bg-danger-50 p-4">
                <Text className="text-sm text-danger">Error: {error}</Text>
            </View>
        );
    }

    if (!profile) return null;

    return (
        <View className="mt-6 rounded-xl border border-divider bg-content1 p-6 shadow-sm">
            <View className="flex-row items-center gap-4">
                <Image
                    source={{ uri: profile.avatarUrl }}
                    className="h-16 w-16 rounded-full"
                />
                <View>
                    <Text className="text-lg font-semibold">{profile.name}</Text>
                    <Text className="text-sm text-default-500">{profile.email}</Text>
                </View>
            </View>

            <View className="mt-4 flex-row gap-6">
                <View>
                    <Text className="text-xl font-bold">{profile.stats.gamesOwned}</Text>
                    <Text className="text-xs text-default-400">Owned</Text>
                </View>
                <View>
                    <Text className="text-xl font-bold">
                        {profile.stats.gamesPlayed}
                    </Text>
                    <Text className="text-xs text-default-400">Played</Text>
                </View>
                <View>
                    <Text className="text-xl font-bold">{profile.stats.friends}</Text>
                    <Text className="text-xs text-default-400">Friends</Text>
                </View>
            </View>

            <Text className="mt-3 text-xs text-default-400">
                Plan: {profile.plan} · Language: {profile.preferredLanguage}
            </Text>
        </View>
    );
}
