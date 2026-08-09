# Board Game Organizer

A multi-platform application for tracking and organizing board game sessions, collections, and player statistics. Built as a monorepo with Turborepo, featuring a Next.js web frontend, a Next.js API layer, and an Expo React Native mobile app.

## Stack

| Layer | Technology |
|-------|-----------|
| **Monorepo** | Turborepo + pnpm workspaces |
| **Web App** | Next.js 16 (App Router, React 19) |
| **API** | Next.js 16 (Route Handlers) |
| **Mobile** | Expo 52 (React Native, Expo Router) |
| **Language** | TypeScript across all apps |

## Project Structure

```
board-game-organizer/
├── package.json             # Root workspace config
├── turbo.json               # Pipeline definitions
├── pnpm-workspace.yaml      # Workspace layout
├── tsconfig.json            # Base TypeScript config
│
├── apps/
│   ├── web/                 # Next.js frontend (port 3000)
│   ├── api/                 # Next.js API server (port 4000)
│   └── mobile/              # Expo React Native app
│
└── packages/                # Shared packages (future)
```

## Getting Started

### Prerequisites

- **Node.js** >= 20 (recommended: 22)
- **pnpm** >= 11

```bash
# Install dependencies
pnpm install

# Start all apps in development mode
pnpm dev
```

### Individual Apps

```bash
# Web frontend (http://localhost:3000)
pnpm --filter web dev

# API server (http://localhost:4000)
pnpm --filter api dev

# Mobile app (Expo Go or emulator)
pnpm --filter mobile dev
```

### Quality Checks

```bash
pnpm typecheck   # TypeScript check across all apps
pnpm lint        # ESLint across all apps
pnpm build       # Production build
```

## Features (Planned)

- **Collection Management** — Track owned games, expansions, and wishlists
- **Session Logging** — Log plays with player counts, scores, and durations
- **Player Profiles** — Track individual player statistics and win rates
- **Game Catalog** — Browse games by mechanics, player count, weight, and play time
- **BGG Integration** — Import game data from BoardGameGeek
- **Game group** creation and management
- **Match scheduling** with player invitations
- **Board game catalog** and selection
- **Location/venue** selection
- **ELO ranking** between players
- **Competitive player** organization
- **Board game** marketplace
- **Mobile app** (Expo)

## License

MIT
