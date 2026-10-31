import { z } from "zod";

/** A server-verified address, shared by groups, events and favorite locations. */
export const verifiedLocationSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(4).max(120),
    address: z.string().trim().min(1).max(500),
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-90).max(90),
    timeZone: z.string().min(1).max(100).optional(),
  })
  .strict();
export type VerifiedLocation = z.infer<typeof verifiedLocationSchema>;
