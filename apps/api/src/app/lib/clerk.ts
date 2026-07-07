import { clerkClient } from '@clerk/nextjs/server'

export interface Profile {
  id: string
  fullName: string | null
  username: string | null
  imageUrl: string
  emailAddress: string | null
}

export const toProfile = (u: any): Profile => ({
  id: u.id,
  fullName: [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
  username: u.username,
  imageUrl: u.imageUrl,
  emailAddress: u.emailAddresses[0]?.emailAddress ?? null,
})

export async function enrichUserIds(userIds: string[]): Promise<Profile[]> {
  if (!userIds.length) return []
  const client = await clerkClient()
  const chunks = Array.from({ length: Math.ceil(userIds.length / 100) }, (_, i) =>
    userIds.slice(i * 100, i * 100 + 100)
  )
  const results = await Promise.all(chunks.map((c) => client.users.getUserList({ userId: c })))
  return results.flatMap((r) => r.data.map(toProfile))
}

export async function enrichRelationships<T extends { fromUserId: string; toUserId: string }>(
  relationships: T[],
  viewerId: string
) {
  const otherIds = relationships.map((r) => (r.fromUserId === viewerId ? r.toUserId : r.fromUserId))
  const profiles = new Map((await enrichUserIds(otherIds)).map((p) => [p.id, p]))
  return relationships.map((r) => ({
    ...r,
    profile: profiles.get(r.fromUserId === viewerId ? r.toUserId : r.fromUserId) ?? null,
  }))
}

export async function enrichSingleUser(userId: string): Promise<Profile | null> {
  try {
    const client = await clerkClient()
    return toProfile(await client.users.getUser(userId))
  } catch {
    return null
  }
}