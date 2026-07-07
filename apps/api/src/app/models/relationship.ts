// packages/db/src/models/relationship.ts
import { ObjectId } from 'mongodb'

export type RelationshipType = 'follow' | 'friend_request' | 'friend' | 'block'
export type RelationshipStatus = 'pending' | 'accepted' | 'blocked'

export interface Relationship {
  _id?: ObjectId
  fromUserId: string      // Clerk user ID
  toUserId: string        // Clerk user ID
  type: RelationshipType
  status: RelationshipStatus
  createdAt: Date
  updatedAt: Date
}

/*
  Logica degli stati per tipo:
  
  FOLLOW:          fromUserId → toUserId   | status: 'accepted' (immediato)
  FRIEND_REQUEST:  fromUserId → toUserId   | status: 'pending' → 'accepted'
  FRIEND:          fromUserId ↔ toUserId   | status: 'accepted' (dopo accept, crei record bidirezionale)
  BLOCK:           fromUserId → toUserId   | status: 'blocked'
*/