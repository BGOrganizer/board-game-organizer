import { serve } from "inngest/next";
import { inngest } from "@/app/lib/events/event-deadlines";

// Inngest validates signed execution requests; never add an unsigned execution endpoint.
export const { GET, POST, PUT } = serve({
  client: inngest,
  // Unified events close participation through exact-cutoff guards; confirmation is manual.
  // Never register legacy automatic Match/booking writers in this deployment.
  functions: [],
});
