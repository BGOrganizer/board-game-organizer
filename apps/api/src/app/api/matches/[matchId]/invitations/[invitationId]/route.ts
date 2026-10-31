import { retiredRecordOperation } from "@/app/lib/community/record-http";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export const DELETE = retiredRecordOperation;
