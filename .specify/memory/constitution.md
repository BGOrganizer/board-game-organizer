# Board Game Match Organizer Constitution

## Core Principles

### I. Monorepo Isolation
Every app and package is independently buildable and type-checkable. No circular dependencies between packages. Dependencies flow strictly: `schemas ← logic ← stores ← apps`. Any cross-package import that violates this direction must be extracted into a new package.

### II. Type-First — No `any`
`strict: true` in every `tsconfig.json`. The `any` type is banned — use `unknown` with explicit narrowing via Zod validation or type guards. All DTOs, entities, and API payloads derive types exclusively through `z.infer<typeof Schema>`. Never maintain a parallel type definition file.

### III. Schema Authority
Zod schemas in `packages/schemas` are the single source of truth. They validate every layer: API request/response bodies, MongoDB documents, Zustand store state, and i18n message arguments. No ODM (no Mongoose, no Prisma) — the native MongoDB driver reads/writes documents typed through Zod inference.

### IV. Shared Logic, Separate UI
UI components have independent implementations for web (HeroUI) and mobile (HeroUI React Native). All other layers are shared: Zod schemas, Zustand stores (where feasible), business logic hooks, i18n catalogs, API fetchers, and config. Prop interfaces are defined in `packages/schemas` or `packages/logic`.

### V. i18n by Default
No hardcoded user-facing strings anywhere. Every text node in components, every API error message, every notification must use LinguiJS macros (`Trans`, `t`, `plural`). Extraction → translation → compilation is part of the Turborepo pipeline.

---

## Technology Stack

### Language & Formatting
- **Language**: TypeScript, strict mode, across all apps and packages
- **Linting/Formatting**: Biome (root config, extended per-app). ESLint + Prettier as fallback only for packages where Biome integration is not viable (e.g. first-generation Expo plugin)
- **Monorepo**: Turborepo + pnpm workspaces

### Apps

| App | Framework | UI Library | Auth | i18n |
|---|---|---|---|---|
| **web** | Next.js (App Router) | HeroUI (`@heroui/react`) | Clerk (`@clerk/nextjs`) | LinguiJS (`@lingui/react`, `@lingui/next`) |
| **api** | Next.js (API routes only) | — | Clerk (JWT middleware) | LinguiJS (`@lingui/core`) |
| **mobile** | Expo (React Native) | HeroUI RN (`@heroui/react-native`) | Clerk (`@clerk/expo`) | LinguiJS (`@lingui/react`) + `expo-localization` |

### Database
- **Engine**: MongoDB (Atlas preferred)
- **Driver**: Native MongoDB driver — no ODM
- **Validation**: Zod schemas from `packages/schemas`
- **DB types**: `z.infer<typeof Schema>` only — no hand-written document interfaces

---

## API Design

### Conventions
- Base path: `/api/v1/`
- Plural kebab-case nouns: `/api/v1/matches`, `/api/v1/match-results`
- Nested resources max 2 levels: `/api/v1/matches/:matchId/participants`
- Standard HTTP methods: `GET`, `POST`, `PUT` (full replace), `PATCH` (partial), `DELETE`
- All bodies: `application/json`

### Status Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created (with `Location` header) |
| 204 | No content |
| 400 | Validation error |
| 401 | Unauthenticated |
| 403 | Unauthorized |
| 404 | Not found |
| 409 | Conflict |
| 422 | Unprocessable entity |
| 500 | Server error |

### Response Shapes
- **Success (list)**: `{ data: T[], meta: { page, pageSize, total } }`
- **Success (single)**: `{ data: T }`
- **Error**: `{ error: { code: SCREAMING_SNAKE_CASE, message: string, details?: unknown } }`

### Pagination & Filtering
- `?page=1&pageSize=20` (default 20, max 100)
- `?sortBy=field&order=asc|desc`
- Filter query params validated with Zod
- Protected routes verify Clerk JWT; public routes explicitly whitelisted
- No stack traces in production

---

## Turborepo Pipeline

| Task | Depends On | Cache | Notes |
|---|---|---|---|
| `build` | `^build` | ✅ `.next/`, `dist/` | — |
| `lint` | — | ✅ | Biome / ESLint |
| `typecheck` | `^build` | ✅ | `tsc --noEmit` |
| `test` | `^build` | ✅ | Vitest |
| `dev` | — | ❌ | `persistent: true` |
| `i18n:extract` | — | ❌ | `lingui extract` |
| `i18n:compile` | `i18n:extract` | ✅ `locales/**/*.ts` | `lingui compile` |

---

## Naming Conventions

- **Files**: `kebab-case`
- **Components**: `PascalCase`
- **Stores, hooks, utils**: `camelCase`
- **Zod schemas**: `PascalCaseSchema` (e.g. `MatchSchema`, `UserSchema`)
- **API error codes**: `SCREAMING_SNAKE_CASE` (e.g. `MATCH_NOT_FOUND`)

---

## Testing

- **Unit tests**: `packages/logic`, `packages/schemas`
- **Integration tests**: `apps/api` route handlers
- **Framework**: Vitest (Turborepo-compatible)

---

## Governance

This constitution supersedes all ad-hoc development practices. Any amendment requires a documented proposal, team approval, and a migration plan. All PRs must verify compliance — reviewers check for hardcoded strings, missing types, `any` usage, and schema duplication.

**Version**: 1.0.0 | **Ratified**: 2026-06-14 | **Last Amended**: 2026-06-14
