# Frontend Documentation / 前端文档

> 本文档面向有语言基础但无游戏开发经验的开发者。
> 不解释 TypeScript/SolidJS 语法，只解释**为什么这样设计**和**社区习惯**。

---

## Table of Contents / 目录

1. [UI Navigation / 界面导航](#ui-navigation)
2. [Module Map / 模块地图](#module-map)
3. [Getting Backend Data / 获取后端数据](#getting-backend-data)
4. [Game Logic / 游戏逻辑](#game-logic)
5. [How to Add Content / 如何添加内容](#how-to-add-content)

---

## UI Navigation / 界面导航

### 主菜单 (Menu.tsx)

```
┌─────────────────────────────┐
│         Tank Game           │  ← 标题
├─────────────────────────────┤
│    [ Single Player ]        │  ← 本地单人游戏按钮
├─────────────────────────────┤
│  [ Player Name 输入框 ]      │  ← 输入玩家名称（多人模式使用）
│                             │
│    [ Multiplayer ]          │  ← 多人游戏按钮（需先输入名称）
└─────────────────────────────┘
```

**交互流程**：
1. 输入玩家名称 → 名称保存到 `localStorage`（下次自动填充）
2. 点击 **Multiplayer** → 连接 WebSocket 服务器 → 进入大厅
3. 点击 **Single Player** → 直接进入本地游戏

### 大厅 (Lobby.tsx)

**未加入房间状态**：
```
┌─────────────────────────────┐
│           Lobby             │
├─────────────────────────────┤
│    [ Create Room ]          │  ← 自动生成 6 位房间 ID
├─────────────────────────────┤
│  [ Room ID 输入框 ]          │  ← 输入已有房间 ID
│    [ Join Room ]            │  ← 加入房间
└─────────────────────────────┘
```

**已加入房间状态**：
```
┌─────────────────────────────┐
│    Room: a3b5c7             │  ← 房间 ID
├─────────────────────────────┤
│  Players (2/4)              │  ← 玩家列表
│  Alice (Owner)     ✓ Ready  │  ← 房主标记
│  Bob               Not Ready│
├─────────────────────────────┤
│  [ Ready / Unready ]        │  ← 切换准备状态
│  All players ready!         │  ← 房主视角提示（所有人就绪后显示）
│  [ Leave Room ]             │  ← 离开房间
└─────────────────────────────┘
```

**交互流程**：
1. 点击 **Create Room** 或输入 ID 点击 **Join Room** → 发送 `Join` 包给服务器
2. 服务器返回 `Welcome` + `RoomUpdate` → 显示玩家列表
3. 点击 **Ready** → 发送 `Ready` 包 → 服务器广播 `RoomUpdate`
4. 所有玩家就绪（>=2 人）→ 服务器广播 `GameStart` → 自动进入游戏

### 游戏画面 (Game.tsx)

纯 Pixi.js 画布，无 DOM UI 元素：
- **画布尺寸**：800×800 像素
- **背景色**：浅灰色 (`0xeeeeee`)
- **地图**：16×16 格子，每个 50px，墙壁为深灰色线条
- **坦克**：蓝色车身 + 炮塔 SVG，直径 30px
- **子弹**：黑色细长矩形，16×4px
- **爆炸**：橙黄同心圆动画

**操控**：
- `W` / `↑` — 前进
- `S` / `↓` — 后退
- `A` / `←` — 左转
- `D` / `→` — 右转
- `Space` — 发射（按住连发，松手换弹）

---

## Module Map / 模块地图

```
src/
├── index.tsx              # 入口：挂载 App 到 DOM
├── App.tsx                # 根组件：状态机（menu/lobby/game）
├── Menu.tsx               # 主菜单界面
├── Lobby.tsx              # 多人游戏大厅
├── network/
│   ├── client.ts          # WebSocket 客户端封装
│   └── types.ts           # 协议类型定义
└── Games/
    ├── Game.tsx           # 游戏主循环 + 渲染
    ├── tank.ts            # 坦克实体类
    ├── bullet.ts          # 子弹实体类
    ├── explosion.ts       # 爆炸效果类
    └── mapGenerator.ts    # DFS 迷宫生成器
```

### 各文件职责

| 文件 | 职责 | 对应后端文件 |
|------|------|-------------|
| `App.tsx` | 状态机：切换 menu/lobby/game 三个场景 | `main.rs`（连接入口） |
| `Menu.tsx` | 显示按钮，收集玩家名称 | - |
| `Lobby.tsx` | 房间管理 UI，处理 Ready/Leave | `rooms/manager.rs` |
| `network/client.ts` | WebSocket 封装，协议包收发 | `main.rs` + `protocol/` |
| `network/types.ts` | TypeScript 类型定义 | `protocol/packets.rs` |
| `Games/Game.tsx` | Pixi.js 初始化，游戏循环，输入处理 | `game/state.rs` |
| `Games/tank.ts` | 坦克移动、旋转、发射、碰撞 | `game/tank.rs` |
| `Games/bullet.ts` | 子弹飞行、反弹、生命周期 | `game/bullet.rs` |
| `Games/explosion.ts` | 爆炸动画渲染 | `game/explosion.rs` |
| `Games/mapGenerator.ts` | 迷宫生成 | `game/map.rs` |

---

## Getting Backend Data / 获取后端数据

### WebSocket 连接建立

```typescript
// App.tsx
const [client] = createSignal(new GameClient('ws://localhost:8080'));

// Menu.tsx → handleMultiplayer
client().connect().then(() => {
  // 连接成功，进入大厅
});
```

**为什么用 `createSignal` 包装 GameClient**：
SolidJS 的 `createSignal` 创建响应式状态。虽然 GameClient 实例本身不变，但 Signal 确保子组件在访问时获得一致引用。实际更简洁的做法是 `const client = new GameClient(...)`，但 `createSignal` 是 SolidJS 社区管理"可能变化的全局状态"的常见习惯。

### 事件处理器注册模式

```typescript
// Lobby.tsx
props.client.onWelcome((playerId, serverTick) => {
  console.log('Connected as', playerId);
});

props.client.onRoomUpdate((players) => {
  setPlayers(players);  // 更新大厅玩家列表
});

props.client.onGameStart((seed, map, tick) => {
  props.onGameStart(map.walls);  // 进入游戏
});

props.client.onState((tick, players, bullets, explosions) => {
  // 更新游戏画面（多人模式）
});
```

**为什么用事件注册而非 async/await**：
WebSocket 是"推送"模型：服务器可能在任意时刻发送消息。事件处理器（Observer Pattern）是处理这种"随时可能到来"的数据的标准做法。async/await 更适合"请求-响应"模型（如 HTTP API）。

### 协议包发送

```typescript
// 加入房间
client.joinRoom('a3b5c7', 'Alice');

// 发送输入（每 tick）
client.sendInput({ up: true, down: false, left: false, right: false, fire: false }, tickCount);

// 发送开火请求
client.sendFire();

// 切换准备状态
client.sendReady();

// 离开房间
client.sendLeave();
```

**为什么 `sendInput` 每 tick 发送**：
即使按键状态没变，也定期发送。这样服务器可以确认"玩家仍然按住这个键"，而不是"玩家松开了但网络丢包导致服务器没收到"。这是网络游戏中"状态同步"的标准做法。

### 数据流路径

```
用户按键
  → window.addEventListener('keydown')
  → Game.tsx keys[code] = true
  → app.ticker (每帧)
  → client.sendInput(keyState, tickCount)
  → WebSocket.send(JSON.stringify(packet))
  → 服务器 handle_connection
  → RoomManager.submit_input
  → GameState.queue_input
  → process_tick
  → broadcast_tx.send(State 包)
  → 所有客户端接收
  → client.ts handleMessage
  → onStateHandler
  → Game.tsx 更新坦克/子弹/爆炸精灵
```

---

## Game Logic / 游戏逻辑

### 本地模式 vs 多人模式

| 特性 | 本地模式 | 多人模式 |
|------|---------|---------|
| 物理运行 | 前端自主运行 | 服务器权威，前端预测 |
| 碰撞检测 | 前端本地计算 | 服务器计算，前端显示 |
| 子弹 | 本地生成和管理 | 服务器生成，前端同步 |
| 死亡判定 | 前端本地判断 | 服务器判断，前端同步 |
| 地图 | MapGenerator 本地生成 | 服务器生成，seed 同步 |

### 游戏主循环

```typescript
// Game.tsx
app.ticker.add(() => {
  if (gameOver()) return;

  if (props.mode === 'local') {
    // 1. 读取输入
    if (keys['ArrowUp']) tank1.moveForward(wallsData);
    // ...

    // 2. 处理发射
    if (spacePressed && !wasSpacePressed) {
      tank1.onSpaceDown();
      tank1.fire(app.stage, currentTime);
    }

    // 3. 碰撞检测
    for (const shooter of tanks) {
      for (const bullet of shooter.bullets) {
        for (const target of tanks) {
          if (hit(bullet, target)) {
            target.die();
            createExplosion(target.x, target.y);
          }
        }
      }
    }

    // 4. 更新子弹
    for (const tank of tanks) {
      tank.updateWithCollision(wallsData);
    }
  } else {
    // 多人模式：预测 + 校正
    // ...
  }

  // 5. 更新爆炸动画
  for (const exp of explosions) {
    exp.update(delta);
  }
});
```

**为什么是 `app.ticker.add` 而非 `requestAnimationFrame`**：
Pixi.js 的 ticker 内部使用 `requestAnimationFrame`，但额外提供了 `deltaMS`（帧间隔）和自动的 60fps 限制。ticker 还管理回调的优先级和暂停，是 Pixi.js 游戏的标准做法。

### 客户端预测 (Client-Side Prediction)

```typescript
// 多人模式
if (!tank1.isDead) {
  // 本地预测：立即响应输入
  if (keys['ArrowUp']) tank1.moveForward(wallsData);
}

// 发送输入给服务器
props.client.sendInput(keyState, tickCount);

// 向服务器状态平滑校正
if (serverPlayerState) {
  tank1.x += (serverPlayerState.x - tank1.x) * 0.15;
  tank1.y += (serverPlayerState.y - tank1.y) * 0.15;
  // 角度校正（归一化到 [-π, π]）
  let rotDiff = serverPlayerState.rotation - tank1.rotation;
  while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
  while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
  tank1.rotation += rotDiff * 0.15;
}
```

**设计意图**：
- **correctionSpeed = 0.15**：每帧向服务器状态移动 15% 的差值。完全覆盖（1.0）会导致跳变，完全不覆盖（0.0）会累积误差。15% 是经验值，在"快速修正"和"平滑体验"之间取得平衡。
- **角度归一化**：弧度表示角度有"环绕"特性（π 和 -π 表示同一方向）。直接相减可能导致坦克绕远路旋转（如从 3.1 到 -3.1，直接差 6.2 弧度，实际只需 0.08 弧度）。归一化确保最短旋转路径。

**社区习惯**：
这是竞技游戏的标准网络架构，称为 **"Client-Side Prediction + Server Reconciliation"**。Quake（1996）首次大规模使用，现代游戏如 Overwatch、Valorant 都采用类似方案。

### 坦克滑动碰撞

```typescript
// tank.ts
private tryMove(dx: number, dy: number, walls: WallSegment[]) {
  // 1. 尝试完整移动
  if (!this.checkCollision(this.x + dx, this.y + dy, walls)) {
    this.x += dx; this.y += dy; return;
  }
  // 2. 尝试只移动 X
  if (!this.checkCollision(this.x + dx, this.y, walls)) {
    this.x += dx; return;
  }
  // 3. 尝试只移动 Y
  if (!this.checkCollision(this.x, this.y + dy, walls)) {
    this.y += dy;
  }
}
```

**设计意图**：
这是 2D 俯视射击游戏的**标配物理**。斜向撞墙时完全停止会很卡，允许沿墙滑动给玩家"流畅操控"的体验。

---

## How to Add Content / 如何添加内容

### 添加新场景/页面

1. **创建新组件文件**（如 `Settings.tsx`）
2. **App.tsx**：
   - 添加新的 `AppMode` 值（如 `'settings'`）
   - 添加新的 `createSignal` 状态
   - 添加 `<Show when={mode() === 'settings'}>` 分支
   - 添加切换函数（如 `handleOpenSettings`）

### 添加新 UI 组件

SolidJS 函数组件示例：
```typescript
interface MyComponentProps {
  title: string;
  onClick: () => void;
}

const MyComponent = (props: MyComponentProps) => {
  const [count, setCount] = createSignal(0);

  return (
    <div class="my-component">
      <h3>{props.title}</h3>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count()}
      </button>
    </div>
  );
};
```

**社区习惯**：
- Props 用 TypeScript 接口定义
- 局部状态用 `createSignal`
- 事件处理器用箭头函数或独立函数
- CSS 类名用字符串（本项目无 CSS-in-JS 库）

### 添加新游戏实体

以添加"道具箱"为例：

1. **创建实体类** `src/Games/powerup.ts`：
```typescript
import { Container, Graphics } from 'pixi.js';

class PowerUp extends Container {
  type: 'speed' | 'shield';
  active: boolean = true;

  constructor(x: number, y: number, type: 'speed' | 'shield') {
    super();
    this.x = x;
    this.y = y;
    this.type = type;

    const gfx = new Graphics();
    gfx.circle(0, 0, 10).fill(type === 'speed' ? 0x00ff00 : 0x0000ff);
    this.addChild(gfx);
  }
}
```

2. **Game.tsx 中注册**：
```typescript
// 创建道具箱
const powerUps: PowerUp[] = [];
const pu = new PowerUp(200, 200, 'speed');
app.stage.addChild(pu);
powerUps.push(pu);

// 在 ticker 中检测碰撞
app.ticker.add(() => {
  for (const pu of powerUps) {
    if (pu.active && hit(tank1, pu)) {
      applyPowerUp(tank1, pu.type);
      pu.active = false;
      pu.parent?.removeChild(pu);
    }
  }
});
```

3. **后端同步**（多人模式）：
   - `protocol/packets.rs`：添加 PowerUpSnapshot
   - `game/state.rs`：在 process_tick 中管理道具状态
   - `client.ts` / `Game.tsx`：同步显示

### 添加新网络消息

1. **`src/network/types.ts`**：添加新接口
2. **`src/network/client.ts`**：
   - 添加发送方法（如 `sendXxx()`）
   - 添加事件处理器注册方法（如 `onXxx(handler)`）
   - 在 `handleMessage` 的 switch 中添加处理分支
3. **后端同步**：
   - `server/src/protocol/packets.rs`：添加 enum variant
   - `server/src/main.rs`：添加处理分支

### 删除内容

以删除"子弹反弹模式"为例：

1. **`src/Games/bullet.ts`**：
   - 删除 `DeactivateMode` 类型
   - 删除 `maxBounces`、`bounces` 字段
   - 简化 `update` 方法，只保留时间检测

2. **`src/Games/tank.ts`**：
   - 删除 `bulletMode` 字段
   - 修改 `fire` 方法，不再传入 mode

3. **后端同步**：
   - `server/src/game/bullet.rs`：删除 BulletMode 枚举
   - `server/src/game/tank.rs`：删除 bullet_mode 字段

---

*Last updated: 2026-05-02*
