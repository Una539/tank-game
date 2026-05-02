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

//! Tank logic (mirrored from frontend)
//! 本模块与前端 `src/Games/tank.ts` 保持逻辑一致，确保权威服务器判定与客户端预测对齐。

use crate::game::collision::check_collision;
use crate::game::map::WallSegment;

/// 基础移动速度（像素/ tick）。3.0 是经典坦克大战的舒适速度：
/// 既不会太快导致操控困难，也不会太慢让玩家感到拖沓。
const SPEED: f64 = 3.0;

/// 每次旋转的弧度增量。0.05 弧度 ≈ 2.86°，属于固定转角速度设计。
/// 为什么不用时序无关的旋转（如 delta_time * speed）：简单直接，经典坦克游戏通常采用固定步长。
const ROTATION_SPEED: f64 = 0.05;

/// 坦克碰撞半径（像素）。15.0 对应车身直径 30px，与前端 `radius: 15` 一致。
/// 圆形碰撞盒是俯视射击游戏的行业惯例，计算简单且玩家可预测。
const RADIUS: f64 = 15.0;

/// 发射冷却间隔（毫秒）。200ms = 5发/秒，与前端 `fireInterval: 200` 一致。
/// 这是经典坦克大战的舒适射速：足够压制，又需节奏控制。
const FIRE_INTERVAL: u64 = 200;

/// 弹夹容量上限。10 发与前端 `bulletLimit: 10` 一致。
const BULLET_LIMIT: i32 = 10;

/// 子弹生成位置偏移量（像素）。30.0 确保子弹不在坦克内部生成，避免自伤。
/// 与前端 `this.x + Math.cos(angle) * 30` 对应。
const BULLET_SPAWN_OFFSET: f64 = 30.0;

/**
 * 服务端坦克实体。
 * 作为权威服务器（Authoritative Server）的核心对象，所有移动和射击判定以本结构状态为准。
 * 与前端 `src/Games/tank.ts` 中的 `Tank` 类保持逻辑一致，字段命名和语义尽量对齐，
 * 便于前后端联调时快速定位差异。
 */
pub struct Tank {
    /// X 轴坐标。使用 f64 而非 i32：游戏物理计算涉及大量三角函数（cos/sin），
    /// 浮点数可直接参与运算，避免频繁类型转换。Rust 游戏开发社区普遍使用 f64。
    pub x: f64,

    /// Y 轴坐标。与 x 保持同类型，确保坐标运算一致性。
    pub y: f64,

    /// 坦克朝向，单位为弧度（radians）。0 表示正右方，递增为顺时针旋转。
    /// 使用弧度而非角度：Rust 标准库三角函数只接受弧度，省去每帧 deg→rad 转换开销。
    pub rotation: f64,

    /// 移动速度（像素/ tick）。当前固定为 SPEED，未来可扩展为可变速度（如加速道具）。
    /// 提取为字段而非硬编码：便于运行时修改，符合"数据驱动"设计习惯。
    pub speed: f64,

    /// 死亡标记。使用 bool 而非 Option<Tank>：死亡是游戏中的常见状态，
    /// bool 占用 1 字节且判断分支简单，比 Option 更直观高效。
    pub is_dead: bool,

    /// 碰撞半径（像素）。值为 15.0，对应车身直径 30px。
    /// 与前端 `radius: number = 15` 一致，确保碰撞判定跨端对齐。
    pub radius: f64,

    /// 当前存活的子弹列表。使用 Vec 而非对象池：4 人 × 每坦克 10 弹 = 40 个对象，
    /// 现代 allocator 可轻松处理。若未来扩展为 32 人大房间，可考虑换为 slab 结构。
    pub bullets: Vec<super::Bullet>,

    /// 剩余可发射子弹数。使用 i32 而非 u32：防止无符号减法下溢 panic，
    /// 尤其在 debug 模式下 Rust 会检查整数溢出。游戏开发社区习惯用有符号整数做计数。
    pub shots_remaining: i32,

    /// 上次发射时间戳（毫秒，Unix epoch）。用于控制射速，与 `fire_interval` 配合。
    /// 为什么不使用 std::time::Instant：Instant 不可序列化，而 timestamp 便于网络同步和日志记录。
    pub last_fire_time: u64,

    /// 发射冷却间隔（毫秒）。与常量 FIRE_INTERVAL 一致，提取为字段便于运行时修改（如道具影响）。
    pub fire_interval: u64,

    /// 开火键是否被按住。长按空格可持续发射，松开时重置弹夹（`shots_remaining`）。
    /// 这是街机射击游戏的经典机制：按住连发、松手换弹。
    pub is_fire_held: bool,

    /// 子弹失效模式。Time 表示 10 秒后自动消失，Bounces 表示反弹 5 次后消失。
    /// 提取为枚举而非 bool：未来可轻松扩展新模式（如穿透、追踪等）。
    pub bullet_mode: super::BulletMode,
}

impl Tank {
    /**
     * 创建新坦克实例。
     *
     * @param x - 初始 X 坐标，通常取地图角落（如 75.0），给玩家留出足够空间避免出生即撞墙
     * @param y - 初始 Y 坐标
     *
     * 为什么 start_x/start_y 不用随机：固定出生点让玩家有策略预期，
     * 且便于平衡（角落出生相对安全）。
     */
    pub fn new(x: f64, y: f64) -> Self {
        Self {
            x,
            y,
            rotation: 0.0,
            speed: SPEED,
            is_dead: false,
            radius: RADIUS,
            bullets: Vec::new(),
            shots_remaining: BULLET_LIMIT,
            last_fire_time: 0,
            fire_interval: FIRE_INTERVAL,
            is_fire_held: false,
            bullet_mode: super::BulletMode::Time,
        }
    }

    /// 获取 X 坐标。提供 getter 便于未来添加偏移计算（如后坐力位移）。
    pub fn x(&self) -> f64 {
        self.x
    }

    /// 获取 Y 坐标。
    pub fn y(&self) -> f64 {
        self.y
    }

    /// 获取朝向（弧度）。
    pub fn rotation(&self) -> f64 {
        self.rotation
    }

    /// 获取死亡状态。
    pub fn is_dead(&self) -> bool {
        self.is_dead
    }

    /// 获取剩余子弹数。
    pub fn shots_remaining(&self) -> i32 {
        self.shots_remaining
    }

    /**
     * 向前移动。计算当前朝向的位移向量，调用 `try_move` 进行碰撞检测。
     * 为什么不直接修改 x/y：需要处理"碰到墙就沿墙滑动"的经典游戏体验。
     * 与前端 `src/Games/tank.ts` 的 `moveForward` 方法逻辑一致。
     *
     * @param walls - 当前地图的所有墙壁线段
     */
    pub fn move_forward(&mut self, walls: &[WallSegment]) {
        let dx = self.rotation.cos() * self.speed;
        let dy = self.rotation.sin() * self.speed;
        self.try_move(dx, dy, walls);
    }

    /**
     * 向后移动。与 move_forward 方向相反，使用负的速度向量。
     * 后退速度不减速：简化设计，经典坦克游戏通常前后同速。
     * 与前端 `src/Games/tank.ts` 的 `moveBackward` 方法逻辑一致。
     *
     * @param walls - 当前地图的所有墙壁线段
     */
    pub fn move_backward(&mut self, walls: &[WallSegment]) {
        let dx = -self.rotation.cos() * self.speed;
        let dy = -self.rotation.sin() * self.speed;
        self.try_move(dx, dy, walls);
    }

    /**
     * 尝试移动，带滑动碰撞（Sliding Collision）。
     * 这是 2D 俯视游戏的标准做法：优先尝试完整移动，若撞墙则分别尝试 X/Y 单轴移动，
     * 给玩家"沿墙滑过"的流畅感，而非完全卡死。
     * 与前端 `src/Games/tank.ts` 的 `tryMove` 方法逻辑一致。
     *
     * @param dx - X 轴位移量
     * @param dy - Y 轴位移量
     * @param walls - 当前地图的所有墙壁线段
     */
    fn try_move(&mut self, dx: f64, dy: f64, walls: &[WallSegment]) {
        if !check_collision(self.x + dx, self.y + dy, self.radius, walls) {
            self.x += dx;
            self.y += dy;
            return;
        }

        if !check_collision(self.x + dx, self.y, self.radius, walls) {
            self.x += dx;
            return;
        }

        if !check_collision(self.x, self.y + dy, self.radius, walls) {
            self.y += dy;
        }
    }

    /**
     * 向左旋转。每次减 ROTATION_SPEED 弧度（约 2.86°）。
     * 固定步长旋转是经典设计：简单直接，玩家容易建立肌肉记忆。
     * 与前端 `src/Games/tank.ts` 的 `turnLeft` 方法逻辑一致。
     */
    pub fn turn_left(&mut self) {
        self.rotation -= ROTATION_SPEED;
    }

    /**
     * 向右旋转。每次加 ROTATION_SPEED 弧度。
     * 与前端 `src/Games/tank.ts` 的 `turnRight` 方法逻辑一致。
     */
    pub fn turn_right(&mut self) {
        self.rotation += ROTATION_SPEED;
    }

    /**
     * 判断当前是否可以发射。包含死亡检查、弹夹检查、按住检查、冷却检查四层过滤。
     * 返回 bool 而非 Result：调用处通常是"能发就发"的简单逻辑，bool 更简洁。
     * 与前端 `src/Games/tank.ts` 的 `canFire` 方法逻辑一致。
     *
     * @param current_time - 当前时间戳（毫秒，Unix epoch）
     * @returns true 表示可以发射
     */
    pub fn can_fire(&self, current_time: u64) -> bool {
        if self.is_dead {
            return false;
        }
        if self.shots_remaining <= 0 {
            return false;
        }
        if !self.is_fire_held {
            return false;
        }
        if current_time - self.last_fire_time < self.fire_interval {
            return false;
        }
        true
    }

    /**
     * 发射子弹。生成 Bullet 实例并递减弹夹。
     * 返回 Option<Bullet> 而非直接 push：解耦"发射判定"与"子弹创建"，便于测试和复用。
     * 与前端 `src/Games/tank.ts` 的 `fire` 方法逻辑一致，
     * 但前端直接加入场景（Pixi.js 习惯），后端返回 Option 以便 GameState 统一管理。
     *
     * @param id - 子弹唯一 ID，由 GameState 分配
     * @param current_time - 当前时间戳（毫秒，Unix epoch）
     * @returns Some(Bullet) 表示发射成功，None 表示条件不满足
     */
    pub fn fire(&mut self, id: u32, current_time: u64) -> Option<super::Bullet> {
        if !self.can_fire(current_time) {
            return None;
        }

        let bullet = super::Bullet::new(
            id,
            self.x + self.rotation.cos() * BULLET_SPAWN_OFFSET,
            self.y + self.rotation.sin() * BULLET_SPAWN_OFFSET,
            self.rotation,
            self.bullet_mode,
        );

        self.shots_remaining -= 1;
        self.last_fire_time = current_time;

        Some(bullet)
    }

    /**
     * 更新该坦克的所有子弹状态。每 tick 调用一次，清理已失效子弹。
     * 为什么不放在 GameState 里统一更新：保持 Tank 的自包含性，便于单机测试。
     * 与前端 `src/Games/tank.ts` 的 `update` 方法逻辑一致。
     *
     * @param walls - 当前地图的所有墙壁线段
     * @param current_time - 当前时间戳（毫秒，Unix epoch）
     */
    pub fn update_bullets(&mut self, walls: &[WallSegment], current_time: u64) {
        for bullet in &mut self.bullets {
            bullet.update(walls, current_time);
        }

        self.bullets.retain(|b| b.active);
    }

    /**
     * 标记开火键按下。同时设置 `is_fire_held = true`，进入连发状态。
     * 与前端 `src/Games/tank.ts` 的 `onSpaceDown` 方法对应。
     */
    pub fn on_fire_down(&mut self) {
        self.is_fire_held = true;
    }

    /**
     * 标记开火键松开。重置 `is_fire_held` 并补满弹夹。
     * 这是"按住连发、松手换弹"机制的核心：给玩家策略选择——持续压制 or 节奏点射。
     * 与前端 `src/Games/tank.ts` 的 `onSpaceUp` 方法对应。
     */
    pub fn on_fire_up(&mut self) {
        self.is_fire_held = false;
        self.shots_remaining = BULLET_LIMIT;
    }

    /**
     * 坦克死亡。设置 is_dead 为 true。
     * 不销毁对象：保留 Tank 实例便于复活机制，且避免频繁重建的性能开销。
     * 与前端 `src/Games/tank.ts` 的 `die` 方法对应。
     */
    pub fn die(&mut self) {
        self.is_dead = true;
    }
}
