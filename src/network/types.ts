// Tank Game — 坦克大战
// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

/**
 * @module network/types
 * @description 前后端共享的网络协议类型定义。
 * 本文件与后端 `server/src/protocol/packets.rs` 保持语义一致，
 * 确保 TypeScript 前端和 Rust 后端对协议包的结构理解相同。
 * 注意：TypeScript 中使用接口（interface）而非类型别名（type），
 * 因为接口支持声明合并，便于未来扩展新字段而不破坏现有代码。
 */

/**
 * 玩家按键状态。
 * 与后端 `server/src/protocol/packets.rs` 的 `KeyState` 结构体对应。
 * 使用布尔字段而非位掩码：虽然位掩码更紧凑，但布尔字段在 TypeScript 中更直观，
 * 且当前玩家数少（最多 4 人），网络开销可忽略。
 */
export interface KeyState {
  /** W 或 ↑ 是否被按下 */
  up: boolean;

  /** S 或 ↓ 是否被按下 */
  down: boolean;

  /** A 或 ← 是否被按下 */
  left: boolean;

  /** D 或 → 是否被按下 */
  right: boolean;

  /** 空格键是否被按下 */
  fire: boolean;
}

/**
 * 玩家状态快照。
 * 服务器每 tick 广播一次，用于客户端校正本地预测。
 * 与后端 `server/src/protocol/packets.rs` 的 `PlayerSnapshot` 结构体对应。
 * 为什么叫"Snapshot"：网络同步中"快照模式"（Snapshot Interpolation）是行业标准术语，
 * 指服务器定期发送完整世界状态，客户端据此更新显示。
 */
export interface PlayerSnapshot {
  /** 玩家唯一 ID（UUID 字符串）。与后端 `Uuid` 对应。 */
  id: string;

  /** X 轴坐标。使用 number（即 JavaScript 的 f64），与 Rust 的 f64 精度一致。 */
  x: number;

  /** Y 轴坐标。 */
  y: number;

  /** 坦克朝向（弧度）。0 表示正右方。 */
  rotation: number;

  /** 是否已死亡。true 时客户端应隐藏坦克并显示爆炸。 */
  is_dead: boolean;

  /** 剩余子弹数。用于同步弹夹状态，确保前后端显示一致。 */
  shots_remaining: number;
}

/**
 * 子弹状态快照。
 * 与后端 `server/src/protocol/packets.rs` 的 `BulletSnapshot` 结构体对应。
 */
export interface BulletSnapshot {
  /** 子弹唯一 ID。由服务器 GameState 的 next_bullet_id 分配。 */
  id: number;

  /** X 轴坐标。 */
  x: number;

  /** Y 轴坐标。 */
  y: number;

  /** 飞行方向（弧度）。 */
  direction: number;

  /** 是否仍然存活。false 时客户端应移除对应精灵。 */
  active: boolean;
}

/**
 * 爆炸状态快照。
 * 与后端 `server/src/protocol/packets.rs` 的 `ExplosionSnapshot` 结构体对应。
 */
export interface ExplosionSnapshot {
  /** 爆炸唯一 ID。 */
  id: number;

  /** 爆炸中心 X 坐标。 */
  x: number;

  /** 爆炸中心 Y 坐标。 */
  y: number;

  /** 动画进度 [0, 1]。0 为开始，1 为结束。客户端据此渲染爆炸大小和透明度。 */
  progress: number;
}

/**
 * 墙壁线段。
 * 与后端 `server/src/protocol/packets.rs` 的 `WallSegment` 结构体对应。
 * 也复用为前端本地地图生成器的输出类型。
 */
export interface WallSegment {
  /** 线段起点 X 坐标。 */
  x1: number;

  /** 线段起点 Y 坐标。 */
  y1: number;

  /** 线段终点 X 坐标。 */
  x2: number;

  /** 线段终点 Y 坐标。 */
  y2: number;

  /** 墙壁类型：'h' 表示水平墙，'v' 表示垂直墙。用于反弹方向计算。 */
  wall_type: string;
}

/**
 * 地图数据。
 * 游戏开始时由服务器下发，客户端据此渲染地图。
 * 与后端 `server/src/protocol/packets.rs` 的 `MapData` 结构体对应。
 */
export interface MapData {
  /** 地图列数。当前固定为 16。 */
  cols: number;

  /** 地图行数。当前固定为 16。 */
  rows: number;

  /** 每个格子的大小（像素）。当前固定为 50，总地图尺寸 800×800。 */
  cell_size: number;

  /** 所有墙壁线段列表。 */
  walls: WallSegment[];
}

/**
 * 房间内的玩家信息。
 * 用于大厅界面显示玩家列表和准备状态。
 * 与后端 `server/src/protocol/packets.rs` 的 `RoomPlayer` 结构体对应。
 */
export interface RoomPlayer {
  /** 玩家唯一 ID。 */
  id: string;

  /** 玩家显示名称。 */
  name: string;

  /** 是否已准备就绪。 */
  ready: boolean;

  /** 是否为房主。房主有额外的控制权限（如开始游戏）。 */
  is_owner: boolean;
}

/**
 * 客户端发送的协议包。
 * 使用宽松类型（index signature）：因为包的 shape 随 type 变化，
 * TypeScript 中无法用联合类型的精确字段约束，故用 `[key: string]: any` 配合运行时检查。
 * 与后端 `server/src/protocol/packets.rs` 的 `ClientPacket` enum 对应。
 */
export interface ClientPacket {
  /** 包类型：'Join' | 'Input' | 'Fire' | 'Ping' | 'Leave' | 'Ready' */
  type: string;

  /** 其他字段根据 type 变化。 */
  [key: string]: any;
}

/**
 * 服务器发送的协议包。
 * 与 `ClientPacket` 同理，使用宽松类型。
 * 与后端 `server/src/protocol/packets.rs` 的 `ServerPacket` enum 对应。
 */
export interface ServerPacket {
  /** 包类型：'Welcome' | 'RoomUpdate' | 'GameStart' | 'State' | 'Pong' | 'GameOver' | 'Error' */
  type: string;

  /** 其他字段根据 type 变化。 */
  [key: string]: any;
}
