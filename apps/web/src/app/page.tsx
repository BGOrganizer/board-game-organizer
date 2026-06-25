import { auth } from "@clerk/nextjs/server";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Counter } from "@/components/Counter";

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

async function getProfile(token: string): Promise<UserProfile> {
  const res = await fetch(`${apiUrl()}/api/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const dynamic = "force-dynamic";

export default async function Home() {
  const { getToken } = await auth();
  const token = await getToken();

  let profile: UserProfile | null = null;
  let error: string | null = null;

  if (token) {
    try {
      profile = await getProfile(token);
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error";
    }
  }

  return (
    <div className="min-h-screen">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-divider px-6 py-4">
        <h1 className="text-xl font-bold text-foreground">
          Board Game Organizer
        </h1>

        <Show
          when="signed-in"
          fallback={<span />}
        >
          <div className="flex items-center gap-3">
            <UserButton />
          </div>
        </Show>
      </header>

      {/* ── Content ── */}
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Show
          when="signed-out"
          fallback={
            <section>
              {error && (
                <div className="mb-4 rounded-lg bg-danger-50 p-4 text-sm text-danger">
                  Errore: {error}
                </div>
              )}

              {profile && (
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
              )}

              {!profile && !error && (
                <p className="text-default-400">Caricamento profilo...</p>
              )}

              <Counter />
            </section>
          }
        >
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
                <button
                  type="button"
                  className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-600"
                >
                  Accedi
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="rounded-lg border border-divider bg-transparent px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-default-100"
                >
                  Registrati
                </button>
              </SignUpButton>
            </div>
          </div>
        </Show>
      </main>
    </div>
  );
}