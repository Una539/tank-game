// Tank Game — 坦克大战
// Copyright (C) 2026 Una
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

//! Room manager
//! 本模块是多人游戏房间系统的核心，管理房间的创建、加入、准备、启动和游戏循环。
//! 与前端 `src/Lobby.tsx` + `src/network/client.ts` 共同构成完整的大厅/房间流程。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{broadcast, Mutex};
use tokio::time::interval;
use uuid::Uuid;

use crate::game::{GameState, Map, WallType as GameWallType};
use crate::networking::GameChannel;
use crate::protocol::Codec;
pub use crate::protocol::{
    BulletSnapshot, ErrorCode, ExplosionSnapshot, MapData, PlayerSnapshot, RoomPlayer,
    ServerPacket, WallSegment as PacketWallSegment, WallType,
};

/// 房间 ID 类型别名。使用 String 而非 Uuid：6 位字母数字组合更短，便于玩家分享。
pub type RoomId = String;

/**
 * 房间内的玩家内部状态。
 * 与 `RoomPlayer`（协议层）的区别：包含内部字段，不直接暴露给客户端。
 * 这是分层架构中的常见做法：内部结构可能有敏感信息，协议层只暴露必要字段。
 */
#[derive(Clone)]
pub struct RoomPlayerInner {
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
 * 游戏房间。
 * 管理房间内的玩家列表、游戏状态和广播通道。
 * 与前端 `src/Lobby.tsx` 中显示的房间信息对应。
 */
pub struct Room {
    /// 房间唯一 ID。6 位字母数字组合，如 "a3b5c7"。
    pub id: RoomId,

    /// 房间内所有玩家的内部状态映射。
    pub players: HashMap<Uuid, RoomPlayerInner>,

    /// 房主玩家 ID。第一个加入房间的玩家自动成为房主。
    pub owner_id: Uuid,

    /// 游戏状态。None 表示游戏未开始，Some 表示游戏进行中。
    pub game_state: Option<GameState>,

    /// 游戏通道。当前未使用（预留用于未来将输入/输出分离到独立任务）。
    pub channel: GameChannel,

    /// 地图生成器。游戏开始时调用 generate 生成具体墙壁布局。
    pub map: Map,

    /// 地图随机种子。确保所有客户端生成相同的地图（确定性随机）。
    pub seed: u64,

    /// 倒计时。当前未使用，预留用于未来"准备后倒计时开始"功能。
    pub countdown: Option<u64>,

    /// 广播发送端。所有房间的 State、RoomUpdate 等消息通过此通道广播。
    /// 使用 tokio::sync::broadcast：支持一对多订阅，新玩家加入时可 subscribe 接收后续消息。
    pub broadcast_tx: broadcast::Sender<Vec<u8>>,

    /// 游戏是否已开始。防止重复启动和游戏过程中加入新玩家。
    pub game_started: bool,
}

impl Room {
    /**
     * 创建新房间。
     *
     * @param id - 房间 ID
     * @param seed - 地图随机种子
     */
    pub fn new(id: RoomId, seed: u64) -> Self {
        let (broadcast_tx, _) = broadcast::channel(256);
        Self {
            id,
            players: HashMap::new(),
            owner_id: Uuid::nil(),
            game_state: None,
            channel: GameChannel::new(32),
            map: Map::new(16, 16, 50),
            seed,
            countdown: None,
            broadcast_tx,
            game_started: false,
        }
    }

    /**
     * 添加玩家到房间。
     * 如果房间为空，该玩家自动成为房主。
     *
     * @param player_id - 玩家 UUID
     * @param name - 玩家显示名称
     */
    pub fn add_player(&mut self, player_id: Uuid, name: &str) {
        if self.players.is_empty() {
            self.owner_id = player_id;
        }

        self.players.insert(
            player_id,
            RoomPlayerInner {
                id: player_id,
                name: name.to_string(),
                ready: false,
                is_owner: player_id == self.owner_id,
            },
        );
    }

    /**
     * 移除玩家。
     *
     * @param player_id - 要移除的玩家 UUID
     * @returns Some(RoomPlayerInner) 如果玩家存在
     */
    pub fn remove_player(&mut self, player_id: &Uuid) -> Option<RoomPlayerInner> {
        self.players.remove(player_id)
    }

    /**
     * 获取房间内所有玩家的协议层信息。
     * 用于构造 RoomUpdate 包广播给客户端。
     * 与前端 `src/network/types.ts` 的 `RoomPlayer[]` 对应。
     *
     * @returns 玩家信息列表
     */
    pub fn get_room_players(&self) -> Vec<RoomPlayer> {
        self.players
            .values()
            .map(|p| RoomPlayer {
                id: p.id,
                name: p.name.clone(),
                ready: p.ready,
                is_owner: p.is_owner,
            })
            .collect()
    }

    /**
     * 切换玩家的准备状态。
     *
     * @param player_id - 玩家 UUID
     * @returns 切换后的 ready 状态
     */
    pub fn toggle_ready(&mut self, player_id: &Uuid) -> bool {
        if let Some(p) = self.players.get_mut(player_id) {
            p.ready = !p.ready;
            return p.ready;
        }
        false
    }

    /**
     * 检查是否所有玩家都已准备。
     * 要求至少 2 人：单人游戏无意义，避免误触 Ready 立即开始。
     *
     * @returns true 表示所有玩家准备就绪且人数 >= 2
     */
    pub fn all_ready(&self) -> bool {
        self.players.len() >= 2 && self.players.values().all(|p| p.ready)
    }

    /**
     * 获取地图数据的协议层表示。
     * 用于构造 GameStart 包发送给客户端。
     * 与前端 `src/network/types.ts` 的 `MapData` 对应。
     *
     * @returns 地图数据
     */
    pub fn get_map_data(&self) -> MapData {
        MapData {
            cols: self.map.cols as u8,
            rows: self.map.rows as u8,
            cell_size: self.map.cell_size as u16,
            walls: self
                .map
                .walls
                .iter()
                .map(|w| PacketWallSegment {
                    x1: w.x1,
                    y1: w.y1,
                    x2: w.x2,
                    y2: w.y2,
                    wall_type: match w.wall_type {
                        GameWallType::Horizontal => WallType::Horizontal,
                        GameWallType::Vertical => WallType::Vertical,
                    },
                })
                .collect(),
        }
    }

    /**
     * 启动游戏。
     * 生成地图、创建 GameState、为每个玩家分配坦克出生点。
     * 由 `main.rs` 的 Ready 处理逻辑在 all_ready() 返回 true 时调用。
     */
    pub fn start_game(&mut self) {
        self.map.generate(self.seed, 0.15);

        let mut game = GameState::new(self.map.clone());

        // 固定出生点：四个角落。与经典坦克大战的出生点设计一致。
        let positions = [(75.0, 75.0), (725.0, 75.0), (75.0, 725.0), (725.0, 725.0)];

        for (i, (_, p)) in self.players.iter().enumerate() {
            let pos = positions.get(i).copied().unwrap_or((75.0, 75.0));
            game.add_player(p.id, &p.name, pos.0, pos.1);
        }

        self.game_state = Some(game);
        self.game_started = true;
    }
}

/**
 * 运行游戏主循环。
 * 固定 16ms tick（约 62.5 TPS），每 tick 调用 GameState::process_tick 并广播状态。
 * 这是权威服务器（Authoritative Server）的核心循环。
 * 与前端 `src/Games/Game.tsx` 中的 `app.ticker.add` 对应，但拥有最终裁决权。
 *
 * @param room - 房间 Arc<Mutex<Room>>，在循环中定期加锁访问
 */
pub async fn run_game_loop(room: Arc<Mutex<Room>>) {
    let tick_duration = Duration::from_millis(16);
    let mut ticker = interval(tick_duration);
    let mut tick_count: u32 = 0;

    loop {
        ticker.tick().await;
        tick_count += 1;
        // 当前时间 = tick_count * 16ms。简化设计，避免频繁调用 SystemTime。
        let current_time = tick_count as u64 * 16;

        // 1. 推进游戏逻辑
        let game_over = {
            let mut room = room.lock().await;
            if let Some(ref mut game) = room.game_state {
                game.process_tick(current_time);
                game.game_over
            } else {
                break;
            }
        };

        // 2. 广播状态快照
        {
            let room = room.lock().await;
            if let Some(ref game) = room.game_state {
                let packet = ServerPacket::State {
                    tick: game.tick,
                    players: game.get_all_snapshots(),
                    bullets: game.get_bullet_snapshots(),
                    explosions: game.get_explosion_snapshots(),
                };

                if let Some(data) = Codec::encode(&packet) {
                    let _ = room.broadcast_tx.send(data);
                }

                // 3. 游戏结束广播
                if game_over {
                    let game_over_packet = ServerPacket::GameOver {
                        winner: game.winner,
                    };
                    if let Some(data) = Codec::encode(&game_over_packet) {
                        let _ = room.broadcast_tx.send(data);
                    }
                    break;
                }
            }
        }
    }
}

/**
 * 房间管理器。
 * 管理所有房间的创建、查询、玩家加入/离开。
 * 使用 Mutex<HashMap> 保护并发访问：tokio::sync::Mutex 是异步互斥锁，
 * 不会阻塞异步运行时线程（与 std::sync::Mutex 的关键区别）。
 */
pub struct RoomManager {
    /// 所有房间的映射。Key 为房间 ID，Value 为 Arc<Mutex<Room>>。
    /// 使用 Arc<Mutex<Room>> 两层包装：
    /// - Arc：多个任务可能同时持有同一房间的引用（如广播任务、游戏循环任务）。
    /// - Mutex：保护房间的内部状态（玩家列表、游戏状态等）。
    rooms: Mutex<HashMap<RoomId, Arc<Mutex<Room>>>>,
}

impl RoomManager {
    /**
     * 创建新的房间管理器。
     */
    pub fn new() -> Self {
        Self {
            rooms: Mutex::new(HashMap::new()),
        }
    }

    /**
     * 生成随机房间 ID。
     * 6 位字母数字组合，共 36^6 ≈ 21 亿种可能，碰撞概率极低。
     * 使用小写：便于玩家输入和分享。
     *
     * @returns 新生成的房间 ID
     */
    pub fn generate_room_id(&self) -> RoomId {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let id: String = (0..6)
            .map(|_| {
                let idx = rng.gen_range(0..36);
                if idx < 10 {
                    (b'0' + idx) as char
                } else {
                    (b'a' + idx - 10) as char
                }
            })
            .collect();
        id
    }

    /**
     * 创建房间并添加房主。
     *
     * @param owner_id - 房主玩家 UUID
     * @param owner_name - 房主显示名称
     * @returns 新创建的房间 ID
     */
    pub async fn create_room(&self, owner_id: Uuid, owner_name: &str) -> RoomId {
        let room_id = self.generate_room_id();
        let room = Arc::new(Mutex::new(Room::new(room_id.clone(), rand::random())));
        room.lock().await.add_player(owner_id, owner_name);
        self.rooms.lock().await.insert(room_id.clone(), room);
        room_id
    }

    /**
     * 加入房间。如果房间不存在则自动创建。
     * 这是"输入即创建"的 UX 设计：玩家输入任意 ID 即可创建房间，无需先点"创建"再分享。
     *
     * @param player_id - 加入的玩家 UUID
     * @param room_id - 房间 ID
     * @param player_name - 玩家显示名称
     * @returns Ok(players) 加入成功，Err(ErrorCode) 加入失败
     */
    pub async fn join_room(
        &self,
        player_id: &Uuid,
        room_id: &str,
        player_name: &str,
    ) -> Result<Vec<RoomPlayer>, ErrorCode> {
        let mut rooms = self.rooms.lock().await;

        // 房间不存在：自动创建
        if !rooms.contains_key(room_id) {
            let new_room_id = room_id.to_string();
            let room = Arc::new(Mutex::new(Room::new(new_room_id.clone(), rand::random())));
            room.lock().await.add_player(*player_id, player_name);
            rooms.insert(new_room_id.clone(), room);
            let room = rooms.get(&new_room_id).unwrap().clone();
            drop(rooms);
            return Ok(room.lock().await.get_room_players());
        }

        let room = rooms.get(room_id).ok_or(ErrorCode::RoomNotFound)?.clone();
        drop(rooms);

        let mut room = room.lock().await;

        // 房间已满
        if room.players.len() >= 4 {
            return Err(ErrorCode::RoomFull);
        }

        // 游戏已开始
        if room.game_started {
            return Err(ErrorCode::GameNotStarted);
        }

        room.add_player(*player_id, player_name);

        Ok(room.get_room_players())
    }

    /**
     * 玩家离开房间。
     *
     * @param player_id - 离开的玩家 UUID
     * @param room_id - 房间 ID
     * @returns Some(RoomPlayerInner) 如果玩家确实在房间中
     */
    pub async fn leave_room(&self, player_id: &Uuid, room_id: &str) -> Option<RoomPlayerInner> {
        let rooms = self.rooms.lock().await;
        let room = rooms.get(room_id)?.clone();
        drop(rooms);

        let mut room = room.lock().await;
        let player = room.remove_player(player_id);

        if player.is_some() {
            // 游戏进行中离开：从 GameState 中移除该玩家
            if room.game_started {
                if let Some(ref mut game) = room.game_state {
                    game.remove_player(player_id);
                }
            }
            // 房间为空：删除房间，释放资源
            if room.players.is_empty() {
                self.rooms.lock().await.remove(room_id);
            }
        }

        player
    }

    /**
     * 切换玩家的准备状态。
     *
     * @param player_id - 玩家 UUID
     * @param room_id - 房间 ID
     * @returns Ok(ready_state) 切换成功，Err(ErrorCode) 房间不存在
     */
    pub async fn toggle_ready(&self, player_id: &Uuid, room_id: &str) -> Result<bool, ErrorCode> {
        let rooms = self.rooms.lock().await;
        let room = rooms.get(room_id).ok_or(ErrorCode::RoomNotFound)?.clone();
        drop(rooms);
        let result = room.lock().await.toggle_ready(player_id);
        Ok(result)
    }

    /**
     * 检查是否可以开始游戏。
     * 当前未直接调用（由 main.rs 的 Ready 处理逻辑内联实现），保留供未来使用。
     *
     * @param room_id - 房间 ID
     * @returns Ok(true) 可以开始，Ok(false) 还不能，Err 房间不存在
     */
    pub async fn check_start_game(&self, room_id: &str) -> Result<bool, ErrorCode> {
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(room_id) {
            let mut room = room.lock().await;
            if room.all_ready() {
                room.start_game();
                Ok(true)
            } else {
                Ok(false)
            }
        } else {
            Err(ErrorCode::RoomNotFound)
        }
    }

    /**
     * 获取房间的广播接收器。
     * 新玩家加入房间时调用，subscribe 后接收该房间的后续广播消息。
     *
     * @param room_id - 房间 ID
     * @returns Some(Receiver) 如果房间存在
     */
    pub async fn get_room_broadcast_rx(
        &self,
        room_id: &str,
    ) -> Option<broadcast::Receiver<Vec<u8>>> {
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(room_id) {
            Some(room.lock().await.broadcast_tx.subscribe())
        } else {
            None
        }
    }

    /**
     * 提交玩家输入。
     * 由 main.rs 的 Input 处理分支调用，将输入转发给对应房间的 GameState。
     *
     * @param player_id - 发送输入的玩家 ID
     * @param room_id - 房间 ID
     * @param tick - 客户端 tick
     * @param keys - 按键状态
     * @param timestamp - 客户端时间戳
     */
    pub async fn submit_input(
        &self,
        player_id: &Uuid,
        room_id: &str,
        tick: u32,
        keys: crate::protocol::KeyState,
        timestamp: u64,
    ) {
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(room_id) {
            let mut room = room.lock().await;
            if let Some(ref mut game) = room.game_state {
                game.queue_input(player_id, tick, keys, timestamp);
            }
        }
    }

    /**
     * 提交玩家开火请求。
     * 由 main.rs 的 Fire 处理分支调用。
     *
     * @param player_id - 请求射击的玩家 ID
     * @param room_id - 房间 ID
     * @param timestamp - 客户端时间戳
     */
    pub async fn submit_fire(&self, player_id: &Uuid, room_id: &str, timestamp: u64) {
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(room_id) {
            let mut room = room.lock().await;
            if let Some(ref mut game) = room.game_state {
                game.queue_fire(player_id, timestamp);
            }
        }
    }

    /**
     * 获取房间地图数据。
     * 当前未直接调用（由 Room::get_map_data 内联使用），保留供未来 HTTP API 扩展。
     *
     * @param room_id - 房间 ID
     * @returns Some(MapData) 如果房间存在
     */
    pub async fn get_room_map_data(&self, room_id: &str) -> Option<MapData> {
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(room_id) {
            Some(room.lock().await.get_map_data())
        } else {
            None
        }
    }

    /**
     * 检查游戏是否已开始。
     *
     * @param room_id - 房间 ID
     * @returns true 表示游戏已开始
     */
    pub async fn is_game_started(&self, room_id: &str) -> bool {
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(room_id) {
            room.lock().await.game_started
        } else {
            false
        }
    }

    /**
     * 获取房间地图种子。
     *
     * @param room_id - 房间 ID
     * @returns Some(seed) 如果房间存在
     */
    pub async fn get_room_seed(&self, room_id: &str) -> Option<u64> {
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(room_id) {
            Some(room.lock().await.seed)
        } else {
            None
        }
    }

    /**
     * 获取房间玩家列表（用于 RoomUpdate）。
     *
     * @param room_id - 房间 ID
     * @returns Some(Vec<RoomPlayer>) 如果房间存在
     */
    pub async fn get_room_players_for_update(&self, room_id: &str) -> Option<Vec<RoomPlayer>> {
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(room_id) {
            Some(room.lock().await.get_room_players())
        } else {
            None
        }
    }

    /**
     * 获取房间的 Arc 引用。
     * 供 main.rs 直接操作房间（如启动游戏循环）。
     *
     * @param room_id - 房间 ID
     * @returns Some(Arc<Mutex<Room>>) 如果房间存在
     */
    pub async fn get_room_arc(&self, room_id: &str) -> Option<Arc<Mutex<Room>>> {
        let rooms = self.rooms.lock().await;
        rooms.get(room_id).cloned()
    }
}

impl Default for RoomManager {
    fn default() -> Self {
        Self::new()
    }
}
