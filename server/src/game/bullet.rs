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

//! Bullet logic (mirrored from frontend)
//! 本模块与前端 `src/Games/bullet.ts` 保持逻辑一致，确保权威服务器判定与客户端预测对齐。

use crate::game::map::{WallSegment, WallType};

/// 子弹飞行速度（像素/ tick）。固定为 2.0，与前端 `speed: number = 2` 一致。
/// 较慢的速度让玩家有时间反应和躲避，是经典坦克大战的设计选择。
const SPEED: f64 = 2.0;

/// 最多反弹次数。5 次与前端 `maxBounces: number = 5` 一致。
/// 足够利用墙壁战术反弹射击，又不会无限反弹导致场面混乱。
const MAX_BOUNCES: i32 = 5;

/// 最大存活时间（毫秒）。10000ms = 10秒，与前端 `maxLifeTime: number = 10000` 一致。
/// 限制子弹生命周期防止内存泄漏和场面堆积，10秒足够穿越整张地图。
const MAX_LIFETIME: u64 = 10000;

/// 子弹出生保护期（毫秒）。200ms 内子弹不会造成伤害，防止自伤。
/// 这是俯视射击游戏的常见设计：子弹从炮口生成时与坦克位置极近，
/// 若无保护期玩家移动中发射极易误伤自己。
const SPAWN_TIME_OFFSET: u64 = 200;

/**
 * 服务端子弹实体。
 * 作为权威服务器的一部分，所有子弹运动、反弹、碰撞判定以本结构状态为准。
 * 与前端 `src/Games/bullet.ts` 中的 `Bullet` 类保持逻辑一致。
 */
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bullet {
    /// 子弹唯一 ID。由 GameState 的 `next_bullet_id` 分配递增，用于前后端状态同步。
    pub id: u32,

    /// X 轴坐标。使用 f64 与坦克坐标体系一致，确保碰撞计算精度。
    pub x: f64,

    /// Y 轴坐标。
    pub y: f64,

    /// 飞行方向（弧度）。0 表示正右方，与坦克 rotation 同体系。
    pub direction: f64,

    /// 飞行速度（像素/ tick）。与常量 SPEED 一致，提取为字段便于未来扩展（如加速子弹道具）。
    pub speed: f64,

    /// 是否仍然存活。false 表示已超时或反弹耗尽，将被清理。
    pub active: bool,

    /// 已反弹次数。达到 max_bounces 时子弹失效。
    pub bounces: i32,

    /// 最大反弹次数。与常量 MAX_BOUNCES 一致。
    pub max_bounces: i32,

    /// 子弹生成时间戳（毫秒，Unix epoch）。用于计算存活时间和出生保护期。
    pub spawn_time: u64,

    /// 最大存活时间（毫秒）。与常量 MAX_LIFETIME 一致。
    pub max_lifetime: u64,

    /// 子弹失效策略。Time = 超时消失，Bounces = 反弹耗尽消失。
    /// 与前端 `bulletMode: 'bounces' | 'time'` 对应。
    pub deactivate_mode: BulletMode,

    /// 是否可以造成伤害。false 表示处于出生保护期（spawn_time 后 200ms 内），防止自伤。
    /// 这是关键安全设计：避免玩家发射瞬间移动导致自伤。
    pub can_hit: bool,
}

/**
 * 子弹失效策略枚举。
 * 与前端 `DeactivateMode = 'bounces' | 'time'` 对应。
 * 使用枚举而非字符串：Rust 中枚举类型安全，编译期即可检查所有分支。
 */
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BulletMode {
    /// 按反弹次数失效。反弹 MAX_BOUNCES 次后消失。
    Bounces,
    /// 按存活时间失效。超过 MAX_LIFETIME 后消失。
    Time,
}

impl Default for BulletMode {
    /// 默认使用 Time 模式。与前端 `bulletMode: 'time'` 默认值一致。
    fn default() -> Self {
        Self::Time
    }
}

impl Bullet {
    /**
     * 创建新子弹实例。
     *
     * @param id - 子弹唯一 ID
     * @param x - 发射起点 X 坐标（已包含 BULLET_SPAWN_OFFSET 偏移）
     * @param y - 发射起点 Y 坐标
     * @param direction - 发射方向（弧度）
     * @param mode - 子弹失效策略
     *
     * 为什么 spawn_time 初始为 0：由外部（GameState）调用 `set_spawn_time` 设置，
     * 解耦创建与计时起点，便于测试和不同场景复用。
     */
    pub fn new(id: u32, x: f64, y: f64, direction: f64, mode: BulletMode) -> Self {
        Self {
            id,
            x,
            y,
            direction,
            speed: SPEED,
            active: true,
            bounces: 0,
            max_bounces: MAX_BOUNCES,
            spawn_time: 0,
            max_lifetime: MAX_LIFETIME,
            deactivate_mode: mode,
            can_hit: false,
        }
    }

    /**
     * 设置子弹生成时间戳。
     * 分离为独立方法：GameState 在将子弹加入游戏世界时调用，
     * 避免构造函数中依赖外部时间源，提升可测试性。
     *
     * @param time - 当前时间戳（毫秒，Unix epoch）
     */
    pub fn set_spawn_time(&mut self, time: u64) {
        self.spawn_time = time;
    }

    /**
     * 更新子弹位置并检测墙壁碰撞。
     * 每 tick 调用一次，是子弹运动的核心逻辑。
     * 与前端 `src/Games/bullet.ts` 的 `update` 方法逻辑一致。
     *
     * @param walls - 当前地图的所有墙壁线段
     * @param current_time - 当前时间戳（毫秒，Unix epoch）
     */
    pub fn update(&mut self, walls: &[WallSegment], current_time: u64) {
        if !self.active {
            return;
        }

        let next_x = self.x + self.direction.cos() * self.speed;
        let next_y = self.y + self.direction.sin() * self.speed;

        let mut bounced = false;

        for wall in walls {
            if lines_intersect(
                self.x, self.y, next_x, next_y, wall.x1, wall.y1, wall.x2, wall.y2,
            ) {
                if wall.wall_type == WallType::Horizontal {
                    self.direction = -self.direction;
                } else {
                    self.direction = std::f64::consts::PI - self.direction;
                }

                self.bounces += 1;
                bounced = true;
                break;
            }
        }

        if self.deactivate_mode == BulletMode::Bounces {
            if self.bounces >= self.max_bounces {
                self.active = false;
                return;
            }
        } else if self.deactivate_mode == BulletMode::Time
            && self.spawn_time > 0
            && current_time >= self.spawn_time + self.max_lifetime
        {
            self.active = false;
            return;
        }

        if current_time >= self.spawn_time + SPAWN_TIME_OFFSET {
            self.can_hit = true;
        }

        if !bounced {
            self.x = next_x;
            self.y = next_y;
        }
    }

    /**
     * 使子弹失效。设置 active = false，将在下一 tick 被清理。
     * 与前端 `src/Games/bullet.ts` 的 `deactivate` 方法对应。
     */
    pub fn deactivate(&mut self) {
        self.active = false;
    }
}

/**
 * 判断两条线段是否相交。
 * 使用参数方程法（行列式求解），是计算几何中的经典算法。
 * 与前端 `src/Games/bullet.ts` 的 `linesIntersect` 函数逻辑一致。
 *
 * @returns true 表示两线段相交（不含端点）
 */
#[allow(clippy::too_many_arguments)]
fn lines_intersect(x1: f64, y1: f64, x2: f64, y2: f64, x3: f64, y3: f64, x4: f64, y4: f64) -> bool {
    let den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if den == 0.0 {
        return false;
    }

    let t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    let u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

    t > 0.0 && t < 1.0 && u > 0.0 && u < 1.0
}
