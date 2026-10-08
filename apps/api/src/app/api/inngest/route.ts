import { serve } from "inngest/next";
import { inngest } from "@/app/lib/events/event-deadlines";
import { closeEventAtDeadline, recoverEventDeadlines } from "@/app/lib/events/event-workers";

// Inngest validates signed execution requests; never add an unsigned execution endpoint.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [closeEventAtDeadline, recoverEventDeadlines],
});
