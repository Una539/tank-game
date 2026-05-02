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

//! Game state management
//! 本模块是权威服务器（Authoritative Server）的核心，管理所有玩家的状态、子弹、爆炸和游戏进程。
//! 与前端 `src/Games/Game.tsx` 中的游戏循环对应，但前端只做本地预测和渲染，本模块拥有最终裁决权。

use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use crate::game::{Bullet, Explosion, Map, PendingInput, Tank, WallSegment};
use crate::protocol::{BulletSnapshot, ExplosionSnapshot, KeyState, PlayerSnapshot};

/**
 * 游戏状态管理器。
 * 负责维护单局游戏的完整状态，包括所有玩家、子弹、爆炸效果和胜负判定。
 * 每 tick 调用 `process_tick` 推进游戏，是权威服务器架构的核心。
 * 与前端 `src/Games/Game.tsx` 中的游戏循环对应，但拥有最终裁决权。
 */
pub struct GameState {
    /// 当前 tick 计数器。从 0 开始，每调用一次 process_tick 递增 1。
    /// 使用 u32：以 62.5 TPS（16ms/tick）计算，可运行约 2 年不溢出，足够单局游戏。
    pub tick: u32,

    /// 所有玩家的状态映射。Key 为玩家 UUID，Value 为 PlayerState。
    /// 使用 HashMap 而非 Vec：O(1) 按 ID 查找，适合频繁的玩家输入查询。
    pub players: HashMap<Uuid, PlayerState>,

    /// 全局子弹列表（跨玩家）。当前实际由 PlayerState.tank.bullets 管理，
    /// 此字段保留用于未来扩展（如中立子弹、环境陷阱等）。
    pub bullets: Vec<Bullet>,

    /// 全局爆炸效果列表。爆炸是视觉效果，不影响物理，但需同步给前端显示。
    pub explosions: Vec<Explosion>,

    /// 地图数据。使用 Arc 共享：Map 在游戏循环中只读，多个系统可能并发读取（如广播任务）。
    pub map: Arc<Map>,

    /// 游戏是否已结束。true 时 process_tick 直接返回，不再推进物理。
    pub game_over: bool,

    /// 获胜者玩家 ID。None 表示平局或游戏未结束。
    pub winner: Option<Uuid>,

    /// 待处理的射击事件队列。每个元素为 (player_id, timestamp)。
    /// 使用 Vec 作为 FIFO 队列：射击事件按接收顺序处理，简单直接。
    pub fire_events: Vec<(Uuid, u64)>,

    /// 下一个可用的子弹 ID。自增分配，确保每颗子弹有唯一标识便于前后端同步。
    pub next_bullet_id: u32,

    /// 下一个可用的爆炸 ID。自增分配，与 next_bullet_id 同理。
    pub next_explosion_id: u32,
}

/**
 * 单个玩家的完整状态。
 * 包含坦克实体和待处理的输入队列。
 * 与前端 `src/Games/Game.tsx` 中 `keys` 和 `tank1` 的组合概念对应。
 */
pub struct PlayerState {
    /// 玩家唯一 ID。
    pub id: Uuid,

    /// 玩家的坦克实体。所有移动、射击、碰撞判定都通过此对象进行。
    /// 与前端 `src/Games/tank.ts` 的 `Tank` 类对应。
    pub tank: Tank,

    /// 待处理的输入队列。接收自客户端的 Input 包暂存于此，
    /// 在 process_tick 时批量处理。这是"输入缓冲"模式，允许客户端提前发送多帧输入。
    pub inputs: Vec<PendingInput>,
}

impl GameState {
    /**
     * 创建新游戏状态实例。
     *
     * @param map - 游戏地图。使用 Arc 包装以便共享。
     */
    pub fn new(map: Map) -> Self {
        Self {
            tick: 0,
            players: HashMap::new(),
            bullets: Vec::new(),
            explosions: Vec::new(),
            map: Arc::new(map),
            game_over: false,
            winner: None,
            fire_events: Vec::new(),
            next_bullet_id: 1,
            next_explosion_id: 1,
        }
    }

    /**
     * 添加玩家到游戏。
     * 通常在 GameStart 时由 Room 调用，为每个参与玩家创建坦克。
     *
     * @param player_id - 玩家 UUID
     * @param name - 玩家名称（当前未使用，预留用于击杀提示等）
     * @param start_x - 出生点 X 坐标
     * @param start_y - 出生点 Y 坐标
     */
    pub fn add_player(&mut self, player_id: Uuid, _name: &str, start_x: f64, start_y: f64) {
        let tank = Tank::new(start_x, start_y);
        self.players.insert(
            player_id,
            PlayerState {
                id: player_id,
                tank,
                inputs: Vec::new(),
            },
        );
    }

    /**
     * 移除玩家。玩家断开连接或离开房间时调用。
     * 与前端 `src/Games/Game.tsx` 中清理 otherTanks 的逻辑对应。
     *
     * @param player_id - 要移除的玩家 UUID
     */
    pub fn remove_player(&mut self, player_id: &Uuid) {
        self.players.remove(player_id);
    }

    /**
     * 将玩家输入加入待处理队列。
     * 由 RoomManager 在收到客户端 Input 包时调用。
     * 与前端 `src/network/client.ts` 的 `sendInput` 方法对应。
     *
     * @param player_id - 发送输入的玩家 ID
     * @param tick - 客户端声称的 tick 号（当前未严格校验，预留用于反作弊）
     * @param keys - 按键状态
     * @param timestamp - 客户端发送时间戳
     */
    pub fn queue_input(&mut self, player_id: &Uuid, tick: u32, keys: KeyState, timestamp: u64) {
        if let Some(ps) = self.players.get_mut(player_id) {
            ps.inputs.push(PendingInput {
                tick,
                keys,
                timestamp,
            });
        }
    }

    /**
     * 将射击事件加入待处理队列。
     * 由 RoomManager 在收到客户端 Fire 包时调用。
     * 与前端 `src/network/client.ts` 的 `sendFire` 方法对应。
     *
     * @param player_id - 请求射击的玩家 ID
     * @param timestamp - 客户端发送时间戳
     */
    pub fn queue_fire(&mut self, player_id: &Uuid, timestamp: u64) {
        self.fire_events.push((*player_id, timestamp));
    }

    /**
     * 推进一帧游戏逻辑。权威服务器的核心方法，每 16ms 调用一次。
     * 处理顺序：输入 → 射击 → 子弹更新 → 碰撞检测 → 爆炸更新 → 胜负判定。
     * 与前端 `src/Games/Game.tsx` 中 app.ticker.add 的回调逻辑对应，但拥有最终裁决权。
     *
     * @param current_time - 当前时间戳（毫秒）。由 run_game_loop 根据 tick_count * 16 计算。
     */
    pub fn process_tick(&mut self, current_time: u64) {
        if self.game_over {
            return;
        }

        self.tick += 1;

        // 1. 处理所有玩家的输入队列
        for ps in self.players.values_mut() {
            Self::process_player_inputs(&mut ps.tank, &ps.inputs, &self.map.walls);
            ps.inputs.clear();
        }

        // 2. 处理射击事件
        for (player_id, _) in &self.fire_events {
            if let Some(ps) = self.players.get_mut(player_id) {
                ps.tank.on_fire_down();
                if let Some(mut bullet) = ps.tank.fire(self.next_bullet_id, current_time) {
                    bullet.set_spawn_time(current_time);
                    ps.tank.bullets.push(bullet);
                    self.next_bullet_id += 1;
                }
                ps.tank.on_fire_up();
            }
        }
        self.fire_events.clear();

        // 3. 更新所有玩家的子弹
        for ps in self.players.values_mut() {
            ps.tank.update_bullets(&self.map.walls, current_time);
        }

        // 4. 收集所有可造成伤害的子弹，进行碰撞检测
        let mut new_bullets = Vec::new();
        for ps in self.players.values() {
            for bullet in &ps.tank.bullets {
                if bullet.active && bullet.can_hit {
                    new_bullets.push(*bullet);
                }
            }
        }

        for bullet in &new_bullets {
            if !bullet.active {
                continue;
            }
            for target in self.players.values_mut() {
                if target.tank.is_dead {
                    continue;
                }
                if Self::bullet_hit_tank(bullet, &target.tank) {
                    target.tank.is_dead = true;
                    self.explosions.push(Explosion::new(
                        self.next_explosion_id,
                        target.tank.x,
                        target.tank.y,
                    ));
                    self.next_explosion_id += 1;
                }
            }
        }

        // 5. 清理已失效子弹
        for ps in self.players.values_mut() {
            ps.tank.bullets.retain(|b| b.active);
        }

        // 6. 更新爆炸动画
        for exp in &mut self.explosions {
            exp.update(33);
        }
        self.explosions.retain(|e| e.active);

        // 7. 胜负判定：存活玩家数 <= 1 时游戏结束
        let alive: Vec<_> = self.players.values().filter(|p| !p.tank.is_dead).collect();
        if alive.len() <= 1 && !self.players.is_empty() {
            self.game_over = true;
            self.winner = alive.first().map(|p| p.id);
        }
    }

    /**
     * 处理单个玩家的输入队列。
     * 遍历所有待处理输入，依次应用到坦克上。
     * 与前端 `src/Games/Game.tsx` 中 `keys['ArrowUp']` 等条件判断对应。
     *
     * @param tank - 要操作的坦克
     * @param inputs - 待处理的输入列表
     * @param walls - 地图墙壁（用于移动碰撞检测）
     */
    fn process_player_inputs(tank: &mut Tank, inputs: &[PendingInput], walls: &[WallSegment]) {
        for input in inputs {
            if input.keys.left {
                tank.turn_left();
            }
            if input.keys.right {
                tank.turn_right();
            }
            if input.keys.up {
                tank.move_forward(walls);
            }
            if input.keys.down {
                tank.move_backward(walls);
            }
        }
    }

    /**
     * 判断子弹是否击中坦克。
     * 使用圆形碰撞检测：计算子弹中心到坦克中心的距离，小于半径和则命中。
     * 8.0 是子弹半长（16px/2），与前端 `target.radius + 8` 对应。
     *
     * @param bullet - 要检测的子弹
     * @param tank - 要检测的坦克
     * @returns true 表示命中
     */
    fn bullet_hit_tank(bullet: &Bullet, tank: &Tank) -> bool {
        if tank.is_dead {
            return false;
        }
        let dx = bullet.x - tank.x;
        let dy = bullet.y - tank.y;
        let dist = (dx * dx + dy * dy).sqrt();
        dist < tank.radius + 8.0
    }

    /**
     * 获取单个玩家的状态快照。
     * 快照（Snapshot）模式是网络同步的经典做法：每 tick 将完整状态序列化发送给客户端。
     * 与前端 `src/network/types.ts` 的 `PlayerSnapshot` 接口对应。
     *
     * @param player_id - 玩家 UUID
     * @returns Some(PlayerSnapshot) 如果玩家存在
     */
    pub fn get_player_snapshot(&self, player_id: &Uuid) -> Option<PlayerSnapshot> {
        let ps = self.players.get(player_id)?;
        Some(PlayerSnapshot {
            id: ps.id,
            x: ps.tank.x,
            y: ps.tank.y,
            rotation: ps.tank.rotation,
            is_dead: ps.tank.is_dead,
            shots_remaining: ps.tank.shots_remaining,
        })
    }

    /**
     * 获取所有玩家的状态快照。
     * 用于构造 State 包广播给所有客户端。
     * 与前端 `src/network/types.ts` 的 `PlayerSnapshot[]` 对应。
     *
     * @returns 所有玩家的快照列表
     */
    pub fn get_all_snapshots(&self) -> Vec<PlayerSnapshot> {
        self.players
            .values()
            .map(|ps| PlayerSnapshot {
                id: ps.id,
                x: ps.tank.x,
                y: ps.tank.y,
                rotation: ps.tank.rotation,
                is_dead: ps.tank.is_dead,
                shots_remaining: ps.tank.shots_remaining,
            })
            .collect()
    }

    /**
     * 获取所有子弹的状态快照。
     * 遍历所有玩家的坦克子弹，收集为统一列表。
     * 与前端 `src/network/types.ts` 的 `BulletSnapshot[]` 对应。
     *
     * @returns 所有子弹的快照列表
     */
    pub fn get_bullet_snapshots(&self) -> Vec<BulletSnapshot> {
        let mut bullets = Vec::new();
        for ps in self.players.values() {
            for bullet in &ps.tank.bullets {
                bullets.push(BulletSnapshot {
                    id: bullet.id,
                    x: bullet.x,
                    y: bullet.y,
                    direction: bullet.direction,
                    active: bullet.active,
                });
            }
        }
        bullets
    }

    /**
     * 获取所有爆炸的状态快照。
     * 与前端 `src/network/types.ts` 的 `ExplosionSnapshot[]` 对应。
     *
     * @returns 所有爆炸的快照列表
     */
    pub fn get_explosion_snapshots(&self) -> Vec<ExplosionSnapshot> {
        self.explosions
            .iter()
            .map(|e| ExplosionSnapshot {
                id: e.id,
                x: e.x,
                y: e.y,
                progress: e.progress(),
            })
            .collect()
    }
}
