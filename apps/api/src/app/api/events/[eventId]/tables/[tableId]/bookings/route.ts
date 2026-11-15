import { retiredRecordOperation } from "@/app/lib/community/record-http";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export const POST = retiredRecordOperation;
export const GET = retiredRecordOperation;
