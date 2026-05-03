# AGENTS.md

## Project Overview

Tank game with a **SolidJS + Pixi.js** frontend and a **Rust** WebSocket multiplayer server.

## Commands

### Frontend (root)
- `npm run dev` or `npm start` — start Vite dev server on port 3000
- `npm run build` — production build to `dist/`
- `npm run serve` — preview production build
- Package manager: **pnpm** (npm/yarn also work)

### Server (`server/`)
- `cargo run` — start WebSocket server on `0.0.0.0:8080`
- `cargo test` — run Rust tests
- `cargo build` — compile server binary

## Architecture

```
tank-solid/
├── src/                    # SolidJS frontend (Pixi.js game)
│   ├── index.tsx           # Entry point, renders <App />
│   ├── App.tsx             # Renders <TankGame />
│   ├── Menu.tsx            # Main menu with local/multiplayer selection
│   ├── network/            # WebSocket multiplayer client
│   │   └── client.ts       # GameClient: connects to Rust server
│   └── Games/              # Game logic
│       ├── Game.tsx        # Main game loop, PIXI app, input handling
│       ├── tank.ts         # Tank class (movement, collision, firing)
│       ├── bullet.ts       # Bullet class
│       ├── explosion.ts    # Explosion animation
│       └── mapGenerator.ts # DFS maze generation
├── server/                 # Rust multiplayer server
│   ├── src/
│   │   ├── main.rs         # Entry: TCP listener on :8080, WS handler
│   │   ├── lib.rs          # Library exports (protocol, game, networking, rooms, utils)
│   │   ├── protocol/       # ClientPacket / ServerPacket definitions
│   │   ├── game/           # Authoritative game logic
│   │   ├── networking/     # WebSocket handling
│   │   ├── rooms/          # Lobby/room management
│   │   └── utils/          # Fixed-point math, tick timer
│   └── PLAN.md             # Detailed technical plan (design reference)
└── assets/                 # SVG textures (body.svg, gun.svg)
```

## Key Facts

- **Frontend has multiplayer support** — `src/network/client.ts` connects to the Rust WebSocket server; `Menu.tsx` allows entering a custom server URL
- **Server uses MessagePack, not JSON** — both frontend (`@msgpack/msgpack`) and server (`rmp-serde`) communicate via binary MessagePack
- **Canvas**: 800x800, **Grid**: 16x16 cells at 50px each
- **No test framework configured** for frontend — no vitest/jest in deps
- **Prettier** is configured (`.prettierrc.json`) but no lint or format scripts in `package.json`
- **TypeScript** has `"jsx": "preserve"` — Solid JSX transforms via `vite-plugin-solid`, not tsc
- **`pround` crate is commented out** in Cargo.toml — fixed-point math not yet implemented
- Server has `server/target/` build artifacts (gitignored via `.gitignore` patterns)

## Conventions

- Prettier: 2-space tabs, single quotes, semicolons, 80-char print width, trailing commas (es5)
- Game comments and variable names are in Chinese — preserve this convention
- `pnpm-workspace.yaml` only allows esbuild builds — not a real monorepo
