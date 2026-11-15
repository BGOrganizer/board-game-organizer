import type { ErrorEvent } from "@sentry/nextjs";

export function stripSentryRequestContext(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.request;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.contexts;
  delete event.transaction;
  return event;
}

export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  sendDefaultPii: false,
  enableLogs: false,
  tracesSampleRate: 0,
  maxBreadcrumbs: 0,
  beforeSend: stripSentryRequestContext,
};
