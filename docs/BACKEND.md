# Backend Documentation / 后端文档

> 本文档面向有语言基础但无游戏开发经验的开发者。
> 不解释 Rust 语法，只解释**为什么这样设计**和**社区习惯**。

---

## Table of Contents / 目录

1. [Module Map / 模块地图](#module-map)
2. [Data Structures / 数据结构](#data-structures)
3. [Protocol API / 协议 API](#protocol-api)
4. [Game Logic / 游戏逻辑](#game-logic)
5. [How to Add Content / 如何添加内容](#how-to-add-content)
6. [Frontend Interaction / 与前端互动](#frontend-interaction)

---

## Module Map / 模块地图

```
server/src/
├── main.rs              # TCP 监听 + WebSocket 握手 + 包路由
├── lib.rs               # 库入口，统一导出所有模块
├── protocol/            # 协议层：包定义、序列化、错误码
│   ├── packets.rs       # ClientPacket / ServerPacket / Snapshot 结构体
│   ├── codec.rs         # JSON 编码/解码工具
│   └── error.rs         # ErrorCode 枚举
├── game/                # 游戏逻辑层：权威物理
│   ├── state.rs         # GameState：单局游戏状态管理
│   ├── tank.rs          # Tank：移动、旋转、发射
│   ├── bullet.rs        # Bullet：飞行、反弹、生命周期
│   ├── map.rs           # Map：DFS 迷宫生成
│   ├── collision.rs     # 点到线段距离碰撞检测
│   ├── explosion.rs     # Explosion：动画状态
│   └── input.rs         # PendingInput：输入缓冲
├── rooms/               # 房间管理层
│   └── manager.rs       # RoomManager / Room / run_game_loop
├── networking/          # 网络工具层
│   ├── broadcast.rs     # Broadcaster / GameChannel
│   └── heartbeat.rs     # PlayerHeartbeat：延迟测量
└── utils/               # 通用工具
    ├── math.rs          # Vec2 / Vec2F / Vec2I
    └── time.rs          # TickTimer / current_time_ms
```

---

## Data Structures / 数据结构

### GameState — 单局游戏状态

```rust
pub struct GameState {
    pub tick: u32,                          // 当前 tick，从 0 递增
    pub players: HashMap<Uuid, PlayerState>, // 所有玩家，Key=UUID 便于 O(1) 查找
    pub bullets: Vec<Bullet>,               // 全局子弹（当前未使用）
    pub explosions: Vec<Explosion>,         // 爆炸效果列表
    pub map: Arc<Map>,                      // 地图，Arc 共享只读数据
    pub game_over: bool,                    // 游戏是否结束
    pub winner: Option<Uuid>,               // 获胜者
    pub fire_events: Vec<(Uuid, u64)>,      // 待处理射击事件队列
    pub next_bullet_id: u32,               // 子弹 ID 自增计数器
    pub next_explosion_id: u32,            // 爆炸 ID 自增计数器
}
```

**设计意图**：
- `HashMap<Uuid, PlayerState>` 而非 `Vec<PlayerState>`：游戏需要频繁按玩家 ID 查找（如处理输入），HashMap 是 O(1)，Vec 是 O(n)。
- `Arc<Map>`：Map 在游戏过程中只读，Arc 允许多个系统共享同一份地图数据而不复制。
- `next_bullet_id` 自增：每颗子弹需要唯一 ID 以便前后端同步。使用 `u32` 而非 `Uuid`：更紧凑，单局游戏中不会溢出。

### PlayerState — 玩家状态

```rust
pub struct PlayerState {
    pub id: Uuid,
    pub tank: Tank,           // 玩家坦克实体
    pub inputs: Vec<PendingInput>, // 输入缓冲队列
}
```

**设计意图**：
- `inputs` 是 Vec 队列：客户端可能提前发送多帧输入，服务器在 tick 时批量处理。这是"输入缓冲"（Input Buffering）模式，减少网络抖动影响。

### Tank — 坦克实体

```rust
pub struct Tank {
    pub x: f64,               // X 坐标。f64 而非 i32：三角函数直接参与运算
    pub y: f64,               // Y 坐标
    pub rotation: f64,        // 朝向（弧度）。Rust 标准库三角函数只接受弧度
    pub speed: f64,           // 移动速度。提取为字段便于未来道具加速
    pub is_dead: bool,        // 死亡标记。bool 比 Option 更省且直观
    pub radius: f64,          // 碰撞半径 15px
    pub bullets: Vec<Bullet>, // 该坦克发出的子弹
    pub shots_remaining: i32, // 剩余子弹。i32 而非 u32：防止减法下溢 panic
    pub last_fire_time: u64,  // 上次发射时间戳
    pub fire_interval: u64,   // 发射冷却 200ms
    pub is_fire_held: bool,   // 开火键是否按住
    pub bullet_mode: BulletMode, // 子弹失效策略
}
```

**设计意图**：
- 所有字段都是 `pub`：Rust 游戏原型开发中常见做法，减少 getter/setter 样板代码。若需封装，后续再加方法。
- `shots_remaining: i32`：游戏开发社区习惯用有符号整数做计数，debug 模式下 Rust 会检查无符号整数下溢并 panic。

### Bullet — 子弹实体

```rust
pub struct Bullet {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub direction: f64,       // 飞行方向（弧度）
    pub speed: f64,           // 速度 2px/tick
    pub active: bool,         // 是否存活
    pub bounces: i32,         // 已反弹次数
    pub max_bounces: i32,     // 最多反弹 5 次
    pub spawn_time: u64,      // 生成时间戳
    pub max_lifetime: u64,    // 最大存活 10 秒
    pub deactivate_mode: BulletMode, // Time 或 Bounces
    pub can_hit: bool,        // 是否可以造成伤害（出生保护期）
}
```

**设计意图**：
- `can_hit: bool` + `spawn_time: u64`：出生保护期 200ms。子弹从炮口生成时与坦克位置极近，若无保护期玩家移动中发射极易误伤自己。这是俯视射击游戏的常见设计。
- `BulletMode` 枚举：提取为枚举而非 bool，未来可轻松扩展新模式（穿透、追踪等）。

### Room — 游戏房间

```rust
pub struct Room {
    pub id: RoomId,                    // 6 位字母数字，如 "a3b5c7"
    pub players: HashMap<Uuid, RoomPlayerInner>,
    pub owner_id: Uuid,                // 房主 ID
    pub game_state: Option<GameState>, // None=未开始，Some=进行中
    pub broadcast_tx: broadcast::Sender<Vec<u8>>, // 广播通道
    pub game_started: bool,
    // ...
}
```

**设计意图**：
- `broadcast_tx: broadcast::Sender<Vec<u8>>`：tokio 的 broadcast 通道支持一对多订阅。每个玩家连接 subscribe 后接收该房间的所有广播消息（State、RoomUpdate 等）。新玩家加入时可随时 subscribe，自动接收后续消息。
- `game_state: Option<GameState>`：Option 是 Rust 中表达"可能存在也可能不存在"的标准方式。游戏未开始时为 None，开始后为 Some。

---

## Protocol API / 协议 API

### 数据流概览

```
Client (Browser)                          Server (Rust)
     |                                          |
     |---- ClientPacket::Join ----------------->|
     |<--- ServerPacket::Welcome ---------------|
     |<--- ServerPacket::RoomUpdate ------------|
     |                                          |
     |---- ClientPacket::Ready ---------------->|
     |<--- ServerPacket::RoomUpdate ------------|
     |<--- ServerPacket::GameStart -------------|
     |                                          |
     |---- ClientPacket::Input (每 tick) ------>|
     |---- ClientPacket::Fire (按下空格) ------->|
     |<--- ServerPacket::State (每 tick) -------|
     |<--- ServerPacket::GameOver --------------|
```

### ClientPacket — 客户端发送

| 包类型 | 触发时机 | 关键字段 |
|--------|---------|---------|
| `Join` | 点击 Create Room / Join Room | `room_id`, `player_name` |
| `Input` | 每 tick（按住方向键时） | `tick`, `keys: {up,down,left,right,fire}` |
| `Fire` | 按下空格瞬间 | `timestamp` |
| `Ready` | 点击 Ready 按钮 | 无 |
| `Leave` | 点击 Leave Room / 断开连接 | 无 |
| `Ping` | 心跳（当前未使用） | `client_tick` |

### ServerPacket — 服务器发送

| 包类型 | 触发时机 | 关键字段 |
|--------|---------|---------|
| `Welcome` | 加入房间成功后 | `player_id`, `server_tick` |
| `RoomUpdate` | 玩家加入/离开/切换 ready | `players: Vec<RoomPlayer>` |
| `GameStart` | 所有玩家 ready 后 | `seed`, `map`, `server_tick` |
| `State` | 每 tick（游戏进行中） | `tick`, `players`, `bullets`, `explosions` |
| `Pong` | 回复 Ping | `server_tick`, `latency_ms` |
| `GameOver` | 存活玩家 <= 1 | `winner: Option<Uuid>` |
| `Error` | 操作失败 | `code`, `message` |

**设计意图**：
- `Input` 和 `Fire` 分离：Input 是持续状态（每 tick 发送），Fire 是一次性事件（只在按下瞬间发送）。若合并，服务器无法区分"按住空格"和"连发请求"。
- `State` 包包含完整世界快照：这是"快照同步"（Snapshot Sync）模式。虽然数据量大，但当前 4 人 + 40 子弹的场景下，JSON 序列化后约 2-5KB，完全可接受。未来可优化为 Delta Compression（只发送变化的部分）。

---

## Game Logic / 游戏逻辑

### 权威服务器循环 (run_game_loop)

```rust
pub async fn run_game_loop(room: Arc<Mutex<Room>>) {
    let tick_duration = Duration::from_millis(16); // 62.5 TPS
    let mut ticker = interval(tick_duration);
    let mut tick_count: u32 = 0;

    loop {
        ticker.tick().await;           // 等待 16ms
        tick_count += 1;
        let current_time = tick_count as u64 * 16;

        // 1. 推进游戏逻辑
        let game_over = { ... };

        // 2. 广播 State 包给所有玩家
        { ... }

        // 3. 检查游戏结束
        if game_over { break; }
    }
}
```

**设计意图**：
- `interval(tick_duration)`：tokio 的 interval 会自动补偿漂移。如果某 tick 处理耗时超过 16ms，下一次 tick 会立即触发（而不是等待完整的 16ms），确保整体 TPS 稳定。
- `current_time = tick_count * 16`：简化设计，避免每 tick 调用 `SystemTime::now()`。时间精度对当前游戏完全足够。

### process_tick 处理顺序

```rust
pub fn process_tick(&mut self, current_time: u64) {
    self.tick += 1;

    // 1. 处理输入
    for (_, ps) in &mut self.players {
        process_player_inputs(&mut ps.tank, &ps.inputs, walls);
        ps.inputs.clear();
    }

    // 2. 处理射击
    for (player_id, _) in &self.fire_events { ... }
    self.fire_events.clear();

    // 3. 更新子弹
    for (_, ps) in &mut self.players {
        ps.tank.update_bullets(walls, current_time);
    }

    // 4. 碰撞检测（子弹 vs 坦克）
    // 5. 清理失效子弹
    // 6. 更新爆炸动画
    // 7. 胜负判定
}
```

**为什么这个顺序很重要**：
1. **输入 → 射击 → 子弹更新 → 碰撞**：这是标准的游戏循环顺序（Game Loop Pattern）。如果先更新子弹再处理输入，玩家会感觉"按键延迟一帧"。
2. **fire_events 清空**：射击事件是一次性的，处理完后必须清空，否则同一请求会被处理多次。
3. **碰撞检测在子弹更新之后**：子弹必须先移动到新位置，才能判断是否击中坦克。

### 滑动碰撞 (Sliding Collision)

```rust
fn try_move(&mut self, dx: f64, dy: f64, walls: &[WallSegment]) {
    // 1. 尝试完整移动
    if !check_collision(self.x + dx, self.y + dy, self.radius, walls) {
        self.x += dx; self.y += dy; return;
    }
    // 2. 尝试只移动 X
    if !check_collision(self.x + dx, self.y, self.radius, walls) {
        self.x += dx; return;
    }
    // 3. 尝试只移动 Y
    if !check_collision(self.x, self.y + dy, self.radius, walls) {
        self.y += dy;
    }
    // 4. 两轴都失败 → 停止
}
```

**设计意图**：
这是 2D 俯视射击游戏的**标配物理**。如果玩家斜向撞墙，完全停止会感觉很卡；允许沿墙滑动给玩家"流畅操控"的体验。经典游戏如《坦克大战》《Enter the Gungeon》都采用此设计。

---

## How to Add Content / 如何添加内容

### 添加新协议包

1. **`server/src/protocol/packets.rs`**：在 `ClientPacket` 或 `ServerPacket` enum 中添加新 variant
2. **`src/network/types.ts`**：添加对应的 TypeScript 接口字段
3. **`src/network/client.ts`**：添加发送/处理方法（如 `sendXxx()` / `onXxx()`）
4. **`server/src/main.rs`**：在 `handle_connection` 的 `match packet` 中添加处理分支

### 添加新游戏机制

1. **`server/src/game/`**：修改或新增实体（如添加 `PowerUp` 结构体）
2. **`server/src/game/state.rs`**：在 `process_tick` 中添加新机制的处理逻辑
3. **`src/Games/`**：前端添加对应的显示逻辑（如新的 PIXI.Sprite）

### 添加新房间逻辑

1. **`server/src/rooms/manager.rs`**：在 `RoomManager` 中添加新方法
2. **`server/src/main.rs`**：在 `handle_connection` 中调用新方法
3. **`src/Lobby.tsx`**：前端添加对应的 UI 和事件处理

### 添加新网络工具

1. **`server/src/networking/`**：创建新模块文件
2. **`server/src/networking/mod.rs`**：导出模块
3. 在 `Room` 或 `main.rs` 中使用

---

## Frontend Interaction / 与前端互动

### 数据流全景

```
Frontend (Browser)                              Backend (Server)
  ┌─────────────────┐                           ┌─────────────────┐
  │  Keyboard Input │                           │  TCP Listener   │
  └────────┬────────┘                           └────────┬────────┘
           │                                              │
           ▼                                              ▼
  ┌─────────────────┐                           ┌─────────────────┐
  │  GameClient     │ ─── WebSocket ───────────▶│  handle_connection
  │  (client.ts)    │                           │  (main.rs)      │
  └────────┬────────┘                           └────────┬────────┘
           │                                              │
           │ ◀── State 包 (每 16ms) ──────────────────────┤
           │                                              │
           ▼                                              ▼
  ┌─────────────────┐                           ┌─────────────────┐
  │  TankGame       │                           │  RoomManager    │
  │  (Game.tsx)     │                           │  (manager.rs)   │
  └─────────────────┘                           └─────────────────┘
```

### 客户端预测与校正

前端 `Game.tsx` 中的多人模式逻辑：

```typescript
// 1. 本地预测：立即响应输入（零延迟感）
if (!tank1.isDead) {
  if (keys['ArrowUp']) tank1.moveForward(wallsData);
  // ...
}

// 2. 发送输入给服务器
props.client.sendInput(keyState, tickCount);

// 3. 向服务器状态平滑校正
tank1.x += (serverPlayerState.x - tank1.x) * 0.15;
```

**为什么这样做**：
- **纯本地预测**：玩家输入后立即看到反应，零延迟操控感。
- **服务器权威**：服务器每 tick 广播真实状态，防止作弊。
- **平滑校正**：`correctionSpeed = 0.15` 是经验和手感调优的结果。完全覆盖会导致"跳变"（snapping），完全信任本地会累积误差。15% 的渐变既修正偏差又保持流畅。

**社区习惯**：
这是 FPS/竞技游戏的标准网络架构，称为 **"Client-Side Prediction + Server Reconciliation"**。起源可追溯到 Quake（1996），现代游戏如 Overwatch、Valorant 都采用类似方案。

### 地图同步

服务器不发送完整墙壁数据（~300 条线段 ≈ 数 KB），而是发送一个 `u64` 种子：

```rust
// Server
let seed = room_guard.seed;  // u64
room_guard.broadcast_tx.send(GameStart { seed, ... });

// Client
const walls = new MapGenerator(16, 16, 50).generate(seed, 0.15);
```

**为什么**：
- 8 字节种子 vs 数千字节墙壁数据：网络开销减少 99%+。
- 确定性随机：相同 seed 在前后端生成完全相同的地图。这是游戏开发中"seed-based generation"的标准优化。

---

*Last updated: 2026-05-02*
