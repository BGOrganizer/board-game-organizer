/**
 * Shared vitest setup for the mobile app (React Native Testing Library).
 * RNTL registers its matchers on import; only the act flag is needed.
 */
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
