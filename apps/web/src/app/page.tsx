import { Show } from "@clerk/nextjs";

import { Header } from "@/components/Header";
import { LoginFallback } from "@/components/LoginFallback";
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const dynamic = "force-dynamic";

export default async function Home() {

  const { userId } = await auth()

  if (userId) redirect('/matches')

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto max-w-2xl px-4 py-12">
        <Show
          when="signed-out"
        >
          <LoginFallback />

        </Show>
      </main>
    </div>
  );
}