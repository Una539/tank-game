//! Packet definitions using Postcard serialization
//! 本模块定义了前后端通信的所有协议包结构。
//! 原计划使用 Postcard 二进制序列化（见 Cargo.toml 依赖），但目前实际使用 serde_json。
//! 与前端 `src/network/types.ts` 保持语义一致。

use serde::{Serialize, Deserialize};
use uuid::Uuid;

use crate::protocol::error::ErrorCode;

/// 协议版本号。当前为 1，预留用于未来协议升级时的兼容性检查。
pub const PROTOCOL_VERSION: u16 = 1;

/**
 * 客户端发送的协议包枚举。
 * 使用 `#[serde(tag = "type")]` 实现 tagged union：序列化后的 JSON 会包含 "type" 字段，
 * 便于前端 JavaScript 和 Rust 反序列化时快速识别包类型。
 * 这是 JSON 协议中处理多态类型的标准做法。
 * 与前端 `src/network/types.ts` 的 `ClientPacket` 接口对应。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientPacket {
    /// 加入房间请求。发送后服务器返回 Welcome + RoomUpdate。
    Join { room_id: String, player_name: String },

    /// 玩家输入状态。每帧（或每 tick）发送，包含当前按键状态。
    /// tick 字段用于服务器对齐客户端输入时序。
    Input { tick: u32, keys: KeyState, timestamp: u64 },

    /// 开火请求。与 Input 分离：开火是一次性事件而非持续状态，
    /// 需要独立包类型以便服务器精确处理时机。
    Fire { timestamp: u64 },

    /// 心跳 Ping。客户端定期发送，服务器返回 Pong 以测量 RTT。
    Ping { client_tick: u32 },

    /// 离开房间请求。断开与当前房间的关联，但保持 WebSocket 连接。
    Leave,

    /// 切换准备状态请求。切换 ready/unready，所有玩家 ready 后自动开始游戏。
    Ready,
}

/**
 * 按键状态结构体。
 * 与前端 `src/network/types.ts` 的 `KeyState` 接口对应。
 * 使用独立结构体而非位掩码：虽然位掩码更紧凑，但结构体在 JSON 中更自描述，
 * 且当前玩家数少（最多 4 人），网络开销可忽略。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyState {
    /// W 或 ↑ 是否被按下。
    pub up: bool,

    /// S 或 ↓ 是否被按下。
    pub down: bool,

    /// A 或 ← 是否被按下。
    pub left: bool,

    /// D 或 → 是否被按下。
    pub right: bool,

    /// 空格键是否被按下。
    /// `#[serde(default)]` 表示如果 JSON 中缺少此字段，默认值为 false。
    /// 这是向后兼容的设计：旧版客户端可能不发 fire 字段。
    #[serde(default)]
    pub fire: bool,
}

/**
 * 服务器发送的协议包枚举。
 * 同样使用 tagged union，与 `ClientPacket` 对称设计。
 * 与前端 `src/network/types.ts` 的 `ServerPacket` 接口对应。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerPacket {
    /// 欢迎包。连接成功后发送，告知客户端其 player_id 和初始 tick。
    Welcome { player_id: Uuid, server_tick: u32 },

    /// 房间状态更新。玩家加入、离开、切换 ready 时广播给房间内所有玩家。
    RoomUpdate { players: Vec<RoomPlayer> },

    /// 游戏开始通知。所有玩家 ready 后广播，包含地图种子和地图数据。
    GameStart { seed: u64, map: MapData, server_tick: u32 },

    /// 游戏状态同步。每 tick 广播一次，包含所有玩家、子弹、爆炸的完整快照。
    State {
        tick: u32,
        players: Vec<PlayerSnapshot>,
        bullets: Vec<BulletSnapshot>,
        explosions: Vec<ExplosionSnapshot>,
    },

    /// 心跳回应。回复客户端的 Ping，包含服务器当前 tick 和延迟估算。
    Pong { server_tick: u32, latency_ms: u16 },

    /// 游戏结束通知。存活玩家数 <= 1 时广播，包含获胜者 ID（None 表示平局）。
    GameOver { winner: Option<Uuid> },

    /// 错误通知。操作失败时发送，如房间已满、未开始等。
    Error { code: ErrorCode, message: String },
}

/**
 * 房间玩家信息。
 * 用于 RoomUpdate 包，显示大厅中的玩家列表。
 * 与前端 `src/network/types.ts` 的 `RoomPlayer` 接口对应。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomPlayer {
    /// 玩家唯一 ID。
    pub id: Uuid,

    /// 玩家显示名称。
    pub name: String,

    /// 是否已准备就绪。
    pub ready: bool,

    /// 是否为房主。第一个加入房间的玩家自动成为房主。
    pub is_owner: bool,
}

/**
 * 玩家状态快照。
 * 每 tick 通过 State 包广播，用于客户端校正。
 * 与前端 `src/network/types.ts` 的 `PlayerSnapshot` 接口对应。
 * 为什么叫 Snapshot：网络同步中的"快照模式"（Snapshot Interpolation）是行业标准。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerSnapshot {
    /// 玩家唯一 ID。
    pub id: Uuid,

    /// X 轴坐标。使用 f64 与前端 number 精度一致。
    pub x: f64,

    /// Y 轴坐标。
    pub y: f64,

    /// 坦克朝向（弧度）。
    pub rotation: f64,

    /// 是否已死亡。
    pub is_dead: bool,

    /// 剩余子弹数。使用 i32 而非 u32：防止无符号减法下溢。
    pub shots_remaining: i32,
}

/**
 * 子弹状态快照。
 * 与前端 `src/network/types.ts` 的 `BulletSnapshot` 接口对应。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulletSnapshot {
    /// 子弹唯一 ID。
    pub id: u32,

    /// X 轴坐标。
    pub x: f64,

    /// Y 轴坐标。
    pub y: f64,

    /// 飞行方向（弧度）。
    pub direction: f64,

    /// 是否仍然存活。
    pub active: bool,
}

/**
 * 爆炸状态快照。
 * 与前端 `src/network/types.ts` 的 `ExplosionSnapshot` 接口对应。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplosionSnapshot {
    /// 爆炸唯一 ID。
    pub id: u32,

    /// 爆炸中心 X 坐标。
    pub x: f64,

    /// 爆炸中心 Y 坐标。
    pub y: f64,

    /// 动画进度 [0.0, 1.0]。
    pub progress: f32,
}

/**
 * 地图数据。
 * 游戏开始时通过 GameStart 包下发。
 * 与前端 `src/network/types.ts` 的 `MapData` 接口对应。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapData {
    /// 地图列数。使用 u8：最大 255，足够当前 16×16 地图。
    pub cols: u8,

    /// 地图行数。
    pub rows: u8,

    /// 每个格子的大小（像素）。使用 u16：最大 65535，足够。
    pub cell_size: u16,

    /// 所有墙壁线段列表。
    pub walls: Vec<WallSegment>,
}

/**
 * 墙壁线段。
 * 与前端 `src/network/types.ts` 的 `WallSegment` 接口对应。
 * 注意字段命名：后端用 `wall_type`（避免与 Rust 关键字 `type` 冲突），
 * 前端也使用 `wall_type` 保持一致。
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallSegment {
    /// 线段起点 X 坐标。
    pub x1: f64,

    /// 线段起点 Y 坐标。
    pub y1: f64,

    /// 线段终点 X 坐标。
    pub x2: f64,

    /// 线段终点 Y 坐标。
    pub y2: f64,

    /// 墙壁类型：水平或垂直。用于子弹反弹方向计算。
    pub wall_type: WallType,
}

/**
 * 墙壁类型枚举。
 * 与前端 `wall_type: string` 对应，前端值通常为 'h' 或 'v'。
 */
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum WallType {
    /// 水平墙壁。子弹反弹时反转 Y 方向（direction = -direction）。
    Horizontal,

    /// 垂直墙壁。子弹反弹时反转 X 方向（direction = PI - direction）。
    Vertical,
}

impl Default for WallType {
    /// 默认水平墙壁。与前端默认值无关，仅为 Rust 的 Default trait 实现要求。
    fn default() -> Self {
        Self::Horizontal
    }
}

use crate::rooms::RoomPlayerInner;

/**
 * 从内部房间玩家状态转换为协议层玩家状态。
 * 这是分层架构中的常见做法：内部结构（RoomPlayerInner）可能包含敏感或内部字段，
 * 协议层结构（RoomPlayer）只暴露需要发送给客户端的字段。
 */
impl From<&RoomPlayerInner> for RoomPlayer {
    fn from(p: &RoomPlayerInner) -> Self {
        Self {
            id: p.id,
            name: p.name.clone(),
            ready: p.ready,
            is_owner: p.is_owner,
        }
    }
}
