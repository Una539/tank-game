# Tank Game — 坦克大战

A tank battle game with **SolidJS + Pixi.js** frontend and a **Rust** WebSocket multiplayer server.

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

1. Open http://localhost:3000 / 访问 http://localhost:3000
2. Choose **Single Player** for local mode, or enter your name and click **Multiplayer** / 选择**单人模式**，或输入名字后点击**多人模式**
3. In multiplayer: create a room or join an existing room ID, then click **Ready** / 多人模式下：创建房间或输入已有房间 ID 加入，然后点击**准备**
4. When all players are ready, the game starts automatically / 当所有玩家准备就绪后，游戏自动开始

Controls / 操作：
- **WASD** or **Arrow Keys** — Move / 移动
- **Space** — Fire (hold for continuous fire, release to reload) / 发射（按住连发，松手换弹）

---

## Tech Stack / 技术栈

| Layer / 层级 | Technology / 技术 |
|-------------|------------------|
| Frontend / 前端 | [SolidJS](https://solidjs.com) (reactive UI / 响应式 UI), [Pixi.js v8](https://pixijs.com) (2D rendering / 2D 渲染), [Vite](https://vitejs.dev) (build tool / 构建工具) |
| Backend / 后端 | [Rust](https://rust-lang.org), [Tokio](https://tokio.rs) (async runtime / 异步运行时), [tokio-tungstenite](https://github.com/snapview/tokio-tungstenite) (WebSocket) |
| Protocol / 协议 | JSON over WebSocket (planned: Postcard binary) / WebSocket 传输 JSON（计划迁移：Postcard 二进制） |

---

## Project Structure / 项目结构

```
tank-solid/
├── src/                          # Frontend / 前端 (SolidJS + Pixi.js)
│   ├── index.tsx                 # Entry point: mounts <App /> to DOM / 入口：挂载 <App /> 到 DOM
│   ├── App.tsx                   # Root component: mode switcher (menu/lobby/game) / 根组件：模式切换器（菜单/大厅/游戏）
│   ├── Menu.tsx                  # Main menu: Single Player / Multiplayer buttons / 主菜单：单人/多人按钮
│   ├── Lobby.tsx                 # Multiplayer lobby: create/join room, ready up / 多人大厅：创建/加入房间、准备
│   ├── network/
│   │   ├── client.ts             # WebSocket client: connect, send/receive packets / WebSocket 客户端：连接、收发数据包
│   │   └── types.ts              # Shared protocol type definitions / 共享协议类型定义
│   └── Games/
│       ├── Game.tsx              # Main game loop: PIXI app, input, prediction / 游戏主循环：PIXI 应用、输入、预测
│       ├── tank.ts               # Tank class: movement, collision, firing / 坦克类：移动、碰撞、发射
│       ├── bullet.ts             # Bullet class: bounce, time-based expiry / 子弹类：反弹、时间失效
│       ├── explosion.ts          # Explosion animation / 爆炸动画
│       └── mapGenerator.ts       # DFS maze generator / DFS 迷宫生成器
├── server/                       # Backend / 后端 (Rust)
│   └── src/
│       ├── main.rs               # TCP listener on :8080, WebSocket handler / TCP 监听 :8080、WebSocket 处理器
│       ├── lib.rs                # Library exports / 库入口导出
│       ├── protocol/             # ClientPacket / ServerPacket definitions / 协议包定义
│       ├── game/                 # Authoritative game logic / 权威游戏逻辑
│       ├── networking/           # Broadcast and heartbeat / 广播与心跳
│       ├── rooms/                # Lobby/room management, game loop / 大厅/房间管理、游戏循环
│       └── utils/                # Fixed-point math, tick timer / 定点数学、Tick 计时器
├── docs/
│   ├── BACKEND.md                # Backend deep-dive documentation / 后端深度文档
│   ├── FRONTEND.md               # Frontend deep-dive documentation / 前端深度文档
│   └── ARCHITECTURE.md           # System architecture and data flow / 系统架构与数据流
└── assets/                       # SVG textures (body.svg, gun.svg) / SVG 贴图
```

---

## Key Facts / 关键事实

- **Frontend is hybrid / 前端为混合模式** — supports both local single-player and multiplayer via WebSocket / 同时支持本地单人和 WebSocket 多人对战
- **Authoritative Server / 权威服务器** — server runs the "real" physics; client predicts for responsiveness / 服务器运行"真实"物理，客户端做预测以保证响应性
- **Canvas / 画布**: 800×800 pixels / 像素, **Grid / 网格**: 16×16 cells at 50px each / 每个 50 像素
- **Tick Rate / 刷新率**: ~62.5 TPS (16ms per tick) / 每秒约 62.5 帧（每帧 16 毫秒）
- **Server uses JSON / 服务器使用 JSON** — originally planned Postcard binary, currently serde_json for simplicity / 原计划使用 Postcard 二进制，目前为简化使用 serde_json
- **No frontend test framework / 前端暂无测试框架** configured yet — no vitest/jest in deps / 尚未配置 vitest/jest
- **Game comments in Chinese / 游戏代码注释为中文** — preserves the project's established convention / 保留项目既有约定

---

## Documentation / 文档

- [`docs/BACKEND.md`](docs/BACKEND.md) — Backend modules, data structures, API, how to add content / 后端模块、数据结构、API、如何添加内容
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — UI navigation, backend data flow, how to add content / UI 导航、后端数据流、如何添加内容
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System architecture, data flow diagrams, game loop design / 系统架构、数据流图、游戏循环设计

---

## License / 许可证

This project is licensed under the **GNU Affero General Public License v3.0 or later** (AGPL-3.0-or-later).

本项目采用 **GNU Affero General Public License v3.0 或更高版本**（AGPL-3.0-or-later）授权。

See [`LICENSE`](LICENSE) for the full license text. / 完整许可证文本见 [`LICENSE`](LICENSE)。

> **Why AGPL? / 为什么用 AGPL？**
> This is a network multiplayer game. AGPL ensures that anyone running a modified version of the server on a public network must share their source code, protecting the freedom of all players. / 这是一个网络游戏服务器。AGPL 确保任何在公共网络上运行修改版服务器的人都必须共享源代码，保护所有玩家的自由。
