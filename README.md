# Tank Game — 坦克大战

A tank battle game with **SolidJS + Pixi.js** frontend and **Rust** WebSocket multiplayer server.

使用 **SolidJS + Pixi.js** 前端和 **Rust** WebSocket 多人服务器开发的坦克对战游戏。

---

## Quick Start / 快速开始

### Frontend / 前端

```bash
# Install dependencies / 安装依赖
npm install

# Start dev server on port 3000 / 在3000端口上开启开发服务器
npm run dev
```

### Backend / 后端

```bash
cd server

# Start WebSocket server on port 8080 / 在8080端口上开启WebSocket服务器
cargo run
```

### Play / 游玩

1. Open http://localhost:3000 / 访问http://localhost:3000
2. Choose **Single Player** for local mode, or enter your name and click **Multiplayer**
3. In multiplayer: create a room or join an existing room ID, then click **Ready**
4. When all players are ready, the game starts automatically

Controls / 操作：
- **WASD** or **Arrow Keys** — Move / 移动
- **Space** — Fire (hold for continuous fire, release to reload) / 发射（按住连发，松手换弹）

---

## Tech Stack / 技术栈

| Layer | Technology |
|-------|-----------|
| Frontend | [SolidJS](https://solidjs.com) (reactive UI), [Pixi.js v8](https://pixijs.com) (2D rendering), [Vite](https://vitejs.dev) (build tool) |
| Backend | [Rust](https://rust-lang.org), [Tokio](https://tokio.rs) (async runtime), [tokio-tungstenite](https://github.com/snapview/tokio-tungstenite) (WebSocket) |
| Protocol | JSON over WebSocket (planned: Postcard binary) |

---

## Project Structure / 项目结构

```
tank-solid/
├── src/                          # Frontend (SolidJS + Pixi.js)
│   ├── index.tsx                 # Entry point: mounts <App /> to DOM
│   ├── App.tsx                   # Root component: mode switcher (menu/lobby/game)
│   ├── Menu.tsx                  # Main menu: Single Player / Multiplayer buttons
│   ├── Lobby.tsx                 # Multiplayer lobby: create/join room, ready up
│   ├── network/
│   │   ├── client.ts             # WebSocket client: connect, send/receive packets
│   │   └── types.ts              # Shared protocol type definitions
│   └── Games/
│       ├── Game.tsx              # Main game loop: PIXI app, input, prediction
│       ├── tank.ts               # Tank class: movement, collision, firing
│       ├── bullet.ts             # Bullet class: bounce, time-based expiry
│       ├── explosion.ts          # Explosion animation
│       └── mapGenerator.ts       # DFS maze generator
├── server/                       # Backend (Rust)
│   └── src/
│       ├── main.rs               # TCP listener on :8080, WebSocket handler
│       ├── lib.rs                # Library exports
│       ├── protocol/             # ClientPacket / ServerPacket definitions
│       ├── game/                 # Authoritative game logic
│       ├── networking/           # Broadcast and heartbeat
│       ├── rooms/                # Lobby/room management, game loop
│       └── utils/                # Fixed-point math, tick timer
├── docs/
│   ├── BACKEND.md                # Backend deep-dive documentation
│   ├── FRONTEND.md               # Frontend deep-dive documentation
│   └── ARCHITECTURE.md           # System architecture and data flow
└── assets/                       # SVG textures (body.svg, gun.svg)
```

---

## Key Facts / 关键事实

- **Frontend is hybrid** — supports both local single-player and multiplayer via WebSocket
- **Authoritative Server** — server runs the "real" physics; client predicts for responsiveness
- **Canvas**: 800×800 pixels, **Grid**: 16×16 cells at 50px each
- **Tick Rate**: ~62.5 TPS (16ms per tick)
- **Server uses JSON** — originally planned Postcard binary, currently serde_json for simplicity
- **No frontend test framework** configured yet — no vitest/jest in deps
- **Game comments in Chinese** — preserves the project's established convention

---

## Documentation / 文档

- [`docs/BACKEND.md`](docs/BACKEND.md) — Backend modules, data structures, API, how to add content
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — UI navigation, backend data flow, how to add content
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System architecture, data flow diagrams, game loop design

---

## License / 许可证

MIT
