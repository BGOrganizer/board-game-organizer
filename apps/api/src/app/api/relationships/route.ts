// apps/api/src/app/api/relationships/route.ts
import { listHandler, typedMutationHandler } from "@/app/lib/handler";
import { CREATE, REMOVE, UPDATE } from "@/app/lib/relationship.actions";

export const GET = listHandler;
export const POST = typedMutationHandler(CREATE);
export const PATCH = typedMutationHandler(UPDATE);
export const DELETE = typedMutationHandler(REMOVE);
