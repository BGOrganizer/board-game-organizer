---
name: bgo-component-architecture
description: >-
  Board Game Organizer component architecture and file ownership. Use when adding,
  extracting, reviewing, or reorganizing React/Next.js or Expo components, feature
  folders, shared hooks, or headless providers. Covers platform boundaries, one
  public component per file, private helper exceptions, and component concision.
  Does not authorize application-wide refactoring or a universal UI framework.
---

# BGO component architecture

Read [AGENTS.md](../../../AGENTS.md) first. Its invariants, installed versions, and
current callers override generic skill examples. Load `vercel-composition-patterns`
and the relevant web/native guide only when the task needs their details.

## Start with the smallest real reuse

Inspect the touched feature on both platforms and every caller before extracting
shared code. Prefer an existing helper, then a pure function, then a shared hook.
Use a headless provider only when multiple children need one workflow instance.
Do not extract code merely because it could be reused someday.

## Keep boundaries explicit

- Next.js routing/layouts and server/client boundaries stay in `apps/web/src/app`.
- Expo Router routing/layouts and native navigation stay in `apps/mobile/src/app`.
- Web HeroUI/DOM and mobile HeroUI Native/React Native UI remain platform-specific.
- Browser/native APIs, permissions, Clerk adapters, environment reads, feedback,
  and platform refs remain in their app. No JSX does not imply shared code.
- Platform-independent business rules, API helpers, and reusable data/workflow
  hooks belong in `packages/shared`; validation/models belong in `packages/schemas`.
- Database access, privileged authorization, and backend secrets stay in the API.
- TanStack Query owns remote data, scoped by API/user/resource with fresh tokens.
  Never mirror it into Zustand or provider state. Zustand owns UI/unsaved drafts.
- BGO organizations/membership are not Clerk Organizations/tenancy. Do not map
  these domains together because an organization-related guide is installed.

## File and feature ownership

One public/top-level component per file, named after that component. Framework
route files may retain required metadata/configuration exports.

Private helper components used only in that file may stay there. Define them at
module scope, not inside the parent's render: changing component identity can
remount children and lose state. Give a helper its own feature file when another
module needs it. Types, short local hooks, and functions need not each get a file.

Keep components focused. Around **400 implementation lines** signals a review of
responsibilities, branching, repeated markup, and readability, not a hard limit.
Extract cohesive components/hooks/pure logic when clarity or testing improves.
Do not split mechanically, game line counts, or replace clarity with indirection.
Total file lines including comments/types/private helpers are not the same as
component complexity. Do not add a line-limit linter or CI gate.

Use feature folders within each app's existing `src/components` directory, such
as `events`, `organizations`, or `matches`. Promote components into `common/ui`
only for actual cross-feature reuse with a smaller, clear contract. Do not create
empty folders, import another feature's private implementation, add a giant
barrel, or wrap every HeroUI control solely to rename it.

## Headless behavior, platform-owned structure

A shared provider may render context/fragments/children and expose state/actions.
It must not render host UI (`div`, `form`, `View`, `Text`), HeroUI controls, layout
classes, navigation, or DOM/native refs. Avoid giant contexts and module-level
mutable user/request state. Existing Query/store providers remain authoritative.

Use `children` for static composition; render props are appropriate when passing
data/state back. Reuse page frames within each platform when real patterns match.
Do not build a universal page renderer with platform flags, `cloneElement`
contracts, many placeholder slots, or configuration for future screens. Share
pagination behavior, not the web/native list renderer or accessibility semantics.

Keep Next.js server pages server-capable. Isolate client hooks/providers behind
a narrow client boundary; never mark the entire shared package `"use client"`.
Keep native lists virtualized and preserve cached-content/loading/error behavior.

## Change and verify only requested scope

Apply this convention to new/touched code, not a repository-wide rename. For an
explicit refactor, migrate one bounded feature and update every caller, import,
test, and per-file coverage path without weakening thresholds. Preserve EN/IT,
accessibility, destructive confirmations, permissions, navigation, and web/native
behavioral parity. Run the repository's relevant checks and real E2E acceptance
for changed behavior; static folder/import checks are not runtime acceptance.
