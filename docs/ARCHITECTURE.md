# Architecture Documentation / 架构文档

> 本文档面向有语言基础但无游戏开发经验的开发者。
> 不解释语法，只解释**系统架构**、**数据流**和**设计决策**。

---

## Table of Contents / 目录

1. [System Overview / 系统概览](#system-overview)
2. [Data Flow / 数据流](#data-flow)
3. [Game Loop Architecture / 游戏循环架构](#game-loop-architecture)
4. [Network Protocol / 网络协议](#network-protocol)
5. [Authority & Prediction / 权威与预测](#authority--prediction)
6. [Map Synchronization / 地图同步](#map-synchronization)
7. [State Snapshots / 状态快照](#state-snapshots)

---

## System Overview / 系统概览

本项目采用 **Client-Server 架构**，服务器拥有最终权威（Authoritative Server），客户端做预测和渲染。

```mermaid
graph TB
    subgraph Browser["浏览器 (Frontend)"]
        UI["UI 层<br/>Menu.tsx / Lobby.tsx"]
        Net["网络层<br/>client.ts"]
        Game["游戏层<br/>Game.tsx / tank.ts / bullet.ts"]
        Pixi["渲染层<br/>Pixi.js"]
    end

    subgraph Server["服务器 (Backend)"]
        WS["WebSocket<br/>main.rs"]
        Rooms["房间管理<br/>manager.rs"]
        GState["游戏状态<br/>state.rs"]
        Physics["物理逻辑<br/>tank.rs / bullet.rs"]
        Broadcast["广播通道<br/>broadcast.rs"]
    end

    UI --> Net
    Net -->|"WebSocket"| WS
    WS --> Rooms
    Rooms --> GState
    GState --> Physics
    GState --> Broadcast
    Broadcast -->|"State 包"| Net
    Net --> Game
    Game --> Pixi
```

---

## Data Flow / 数据流

### 多人游戏完整数据流

```mermaid
sequenceDiagram
    participant Player as 玩家 (浏览器)
    participant Client as GameClient
    participant WS as WebSocket 服务器
    participant Room as RoomManager
    participant Game as GameState
    participant Others as 其他玩家

    Note over Player,Others: 连接阶段
    Player->>Client: 点击 Multiplayer
    Client->>WS: connect()
    WS->>Client: WebSocket OPEN

    Note over Player,Others: 大厅阶段
    Player->>Client: 输入房间 ID，点击 Join
    Client->>WS: ClientPacket::Join
    WS->>Room: join_room()
    Room->>WS: 返回玩家列表
    WS->>Client: ServerPacket::Welcome
    WS->>Client: ServerPacket::RoomUpdate
    Client->>Player: 显示玩家列表

    Player->>Client: 点击 Ready
    Client->>WS: ClientPacket::Ready
    WS->>Room: toggle_ready()
    Room->>WS: RoomUpdate 广播
    WS->>Client: ServerPacket::RoomUpdate
    Client->>Player: 更新准备状态

    Note over Player,Others: 游戏开始
    Room->>Room: all_ready() == true
    Room->>Game: start_game()
    Game->>Room: 返回地图 seed
    WS->>Client: ServerPacket::GameStart
    Client->>Player: 进入游戏画面

    Note over Player,Others: 游戏进行中 (每 16ms)
    loop 游戏循环
        Player->>Client: 按键 (WASD / Space)
        Client->>Client: 本地预测移动
        Client->>WS: ClientPacket::Input
        Client->>WS: ClientPacket::Fire (按下瞬间)

        WS->>Room: submit_input() / submit_fire()
        Room->>Game: queue_input() / queue_fire()

        Note right of Game: process_tick()
        Game->>Game: 处理输入
        Game->>Game: 处理射击
        Game->>Game: 更新子弹
        Game->>Game: 碰撞检测
        Game->>Game: 更新爆炸
        Game->>Game: 胜负判定

        WS->>Broadcast: State 包
        Broadcast->>Client: ServerPacket::State
        Client->>Client: 校正本地预测
        Client->>Player: 更新画面
    end

    Note over Player,Others: 游戏结束
    Game->>Room: game_over = true
    WS->>Client: ServerPacket::GameOver
    Client->>Player: 显示结果
```

---

## Game Loop Architecture / 游戏循环架构

### 权威服务器循环

```mermaid
graph LR
    A[等待 16ms] --> B[tick_count += 1]
    B --> C[process_tick]
    C --> D[广播 State 包]
    D --> E{game_over?}
    E -->|No| A
    E -->|Yes| F[广播 GameOver 包]
    F --> G[结束循环]
```

**关键参数**：
- **Tick Rate**: 62.5 TPS（每 tick 16ms）
- **为什么是 62.5**：16ms 是 60fps 显示器的约一帧时间，与前端渲染频率对齐，减少视觉撕裂感。
- **时间计算**: `current_time = tick_count * 16`，简化设计，避免频繁调用系统时钟。

### 前端游戏循环

```mermaid
graph LR
    A[requestAnimationFrame] --> B[读取按键输入]
    B --> C{本地 or 多人?}
    C -->|本地| D[运行完整物理]
    C -->|多人| E[本地预测]
    E --> F[发送 Input 包]
    F --> G[接收 State 包]
    G --> H[平滑校正]
    D --> I[渲染画面]
    H --> I
    I --> A
```

**本地预测 vs 服务器权威**：

| 步骤 | 本地模式 | 多人模式 |
|------|---------|---------|
| 输入响应 | 立即处理 | 立即预测 + 发送服务器 |
| 碰撞检测 | 前端计算 | 服务器计算，前端显示 |
| 死亡判定 | 前端判断 | 服务器判断，前端同步 |
| 画面更新 | 本地物理驱动 | 服务器 State 包驱动 |

---

## Network Protocol / 网络协议

### 协议包序列图

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    Note over C,S: 连接建立
    C->>S: TCP 连接
    S->>C: WebSocket 握手

    Note over C,S: 加入房间
    C->>S: ClientPacket::Join<br/>{room_id, player_name}
    S->>C: ServerPacket::Welcome<br/>{player_id, server_tick}
    S->>C: ServerPacket::RoomUpdate<br/>{players}

    Note over C,S: 准备阶段
    C->>S: ClientPacket::Ready
    S->>C: ServerPacket::RoomUpdate<br/>{players with ready state}

    Note over C,S: 游戏开始
    S->>C: ServerPacket::GameStart<br/>{seed, map, server_tick}

    Note over C,S: 游戏循环 (每 16ms)
    loop Tick
        C->>S: ClientPacket::Input<br/>{tick, keys, timestamp}
        C->>S: ClientPacket::Fire<br/>{timestamp}
        S->>C: ServerPacket::State<br/>{tick, players, bullets, explosions}
    end

    Note over C,S: 游戏结束
    S->>C: ServerPacket::GameOver<br/>{winner}

    Note over C,S: 离开
    C->>S: ClientPacket::Leave
    S->>C: ServerPacket::RoomUpdate<br/>{remaining players}
```

### 序列化格式

当前使用 **JSON over WebSocket Binary Frames**：

```
Client: TextEncoder().encode(JSON.stringify({type: "Input", ...}))
        → WebSocket Binary Frame

Server: serde_json::to_vec(&ServerPacket::State {...})
        → WebSocket Binary Frame

Client: new TextDecoder().decode(ArrayBuffer)
        → JSON.parse() → ServerPacket
```

**为什么用 Binary Frames 传 JSON**：
虽然内容还是 JSON 字符串，但使用 Binary Frame（Opcode 0x2）而非 Text Frame（Opcode 0x1）。这是为了未来兼容 Postcard 二进制格式：服务器和客户端现在按 Binary 处理，将来切换到 Postcard 时无需修改 WebSocket 框架代码。

---

## Authority & Prediction / 权威与预测

### 客户端预测 + 服务器校正

```mermaid
graph TB
    subgraph Client["客户端"]
        Input["玩家输入"]
        Predict["本地预测<br/>立即移动坦克"]
        Buffer["输入缓冲区<br/>待发送队列"]
        Render["渲染画面"]
        Correct["平滑校正<br/>向服务器状态插值"]
    end

    subgraph Server["服务器"]
        Receive["接收输入"]
        Queue["输入队列"]
        Tick["process_tick"]
        Authoritative["权威状态"]
        Broadcast["广播 State"]
    end

    Input --> Predict
    Input --> Buffer
    Buffer -->|"Input 包"| Receive
    Receive --> Queue
    Queue --> Tick
    Tick --> Authoritative
    Authoritative --> Broadcast
    Broadcast -->|"State 包"| Correct
    Predict --> Render
    Correct --> Render
```

**为什么需要客户端预测**：

假设没有预测，玩家按 `W` 后需要：
1. 发送 Input 包到服务器（网络延迟 50ms）
2. 服务器处理（16ms tick）
3. 服务器广播 State 包（50ms）
4. 客户端渲染（总计约 116ms 延迟）

**116ms 的按键延迟会让游戏感觉"黏滞"**。客户端预测允许前端立即响应输入，将延迟降至接近零。

**为什么需要服务器校正**：
如果不校正，客户端的预测会逐渐偏离服务器权威状态（如网络抖动导致输入丢失）。平滑校正（`correctionSpeed = 0.15`）在"快速修正"和"流畅体验"之间取得平衡。

### 校正可视化

```
时间轴 →

客户端预测位置:    ●────●────●────●────●
                         ↘ 轻微偏差
服务器权威位置:          ●────●────●────●
                              ↘ 平滑校正 (15%/帧)
最终显示位置:              ●───●───●───●───●
                              ↑
                         既快速修正又不跳变
```

---

## Map Synchronization / 地图同步

### Seed-Based Generation

```mermaid
graph LR
    subgraph Server["服务器"]
        Seed["随机种子<br/>u64"]
        Gen1["Map::generate(seed)"]
        Map1["地图墙壁"]
    end

    subgraph Client1["客户端 A"]
        Seed2["相同 seed"]
        Gen2["MapGenerator::generate(seed)"]
        Map2["相同地图"]
    end

    subgraph Client2["客户端 B"]
        Seed3["相同 seed"]
        Gen3["MapGenerator::generate(seed)"]
        Map3["相同地图"]
    end

    Seed --> Gen1 --> Map1
    Seed -->|"GameStart {seed}"| Seed2
    Seed -->|"GameStart {seed}"| Seed3
    Seed2 --> Gen2 --> Map2
    Seed3 --> Gen3 --> Map3
```

**为什么用种子同步**：

| 方案 | 数据量 | 优点 | 缺点 |
|------|--------|------|------|
| 发送完整墙壁 | ~5KB | 简单直接 | 网络开销大，延迟高 |
| 发送种子 (u64) | 8 字节 | 极小开销，极快同步 | 需要确定性随机算法 |

使用 **seed-based generation** 将地图同步开销从数千字节降至 8 字节，减少 99%+ 的网络传输。关键前提是**前后端使用相同的随机算法和生成逻辑**：
- 后端：`rand::rngs::StdRng::seed_from_u64(seed)`
- 前端：`Math.random()` 无法种子化，所以前端本地模式不使用种子同步（直接用 `Math.random()`），多人模式从服务器接收 seed 后目前也直接用服务器下发的完整墙壁数据（见 `Game.tsx` 中 `props.serverWalls`）。

**注意**：当前实现中，前端多人模式实际接收的是 `GameStart { map: MapData }` 包，包含完整墙壁数据，而非仅 seed。这是因为前端暂未实现 seed-based 的 MapGenerator。优化方向是前端也实现确定性随机，改为仅接收 seed。

---

## State Snapshots / 状态快照

### 快照内容

每 tick 广播的 State 包包含：

```json
{
  "type": "State",
  "tick": 1234,
  "players": [
    {
      "id": "...",
      "x": 150.5,
      "y": 200.3,
      "rotation": 1.57,
      "is_dead": false,
      "shots_remaining": 8
    }
  ],
  "bullets": [
    {
      "id": 42,
      "x": 180.0,
      "y": 220.0,
      "direction": 1.57,
      "active": true
    }
  ],
  "explosions": [
    {
      "id": 7,
      "x": 200.0,
      "y": 200.0,
      "progress": 0.35
    }
  ]
}
```

### 快照大小估算

| 数据 | 4 人场景 | 估算大小 |
|------|---------|---------|
| 4 PlayerSnapshot | 4 × ~80 bytes | ~320 bytes |
| 40 BulletSnapshot | 40 × ~50 bytes | ~2000 bytes |
| 4 ExplosionSnapshot | 4 × ~40 bytes | ~160 bytes |
| JSON 开销 | - | ~500 bytes |
| **总计** | - | **~3KB/包** |

以 62.5 TPS 计算：
- 每秒数据量：3KB × 62.5 = **187.5 KB/s**
- 4 个玩家同时接收：187.5 × 4 = **750 KB/s 上行带宽**

**当前可接受**，但未来扩展至 16 人或更多子弹时需要优化：
1. **Delta Compression**：只发送变化的部分（如只移动了的玩家）
2. **Binary Protocol**：Postcard 序列化可减少 50-70% 大小
3. **Interest Management**：只发送玩家视野内的实体

---

*Last updated: 2026-05-02*
