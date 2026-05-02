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

//! Explosion effect (mirrored from frontend)
//! 本模块与前端 `src/Games/explosion.ts` 的 `Explosion` 类保持逻辑一致，
//! 确保前后端爆炸动画的进度可以同步（通过 progress 字段）。

/// 爆炸动画总持续时间（毫秒）。500ms = 0.5秒，与前端 `duration: number = 500` 一致。
const DURATION: i32 = 500;

/**
 * 服务端爆炸效果实体。
 * 不直接参与物理碰撞，仅作为视觉效果的权威状态。
 * 每 tick 通过 State 包的 `ExplosionSnapshot` 同步给客户端。
 * 与前端 `src/Games/explosion.ts` 的 `Explosion` 类对应。
 */
pub struct Explosion {
    /// 爆炸唯一 ID。由 GameState 的 `next_explosion_id` 分配。
    pub id: u32,

    /// 爆炸中心 X 坐标。
    pub x: f64,

    /// 爆炸中心 Y 坐标。
    pub y: f64,

    /// 已过去的动画时间（毫秒）。
    pub elapsed: i32,

    /// 爆炸是否仍然活跃。false 时将在下一 tick 被清理。
    pub active: bool,

    /// 最大爆炸半径（像素）。40px 与前端 `maxRadius = 40` 一致。
    max_radius: f64,
}

impl Explosion {
    /**
     * 创建新爆炸实例。
     *
     * @param id - 爆炸唯一 ID
     * @param x - 爆炸中心 X 坐标（被击中坦克的位置）
     * @param y - 爆炸中心 Y 坐标
     */
    pub fn new(id: u32, x: f64, y: f64) -> Self {
        Self {
            id,
            x,
            y,
            elapsed: 0,
            active: true,
            max_radius: 40.0,
        }
    }

    /**
     * 更新爆炸动画。
     * 每 tick 调用，增加 elapsed 时间。
     * 与前端 `src/Games/explosion.ts` 的 `update` 方法对应，
     * 但后端使用固定 33ms delta（由 GameState::process_tick 传入），
     * 前端使用实际帧间隔。
     *
     * @param delta - 本 tick 经过的时间（毫秒）
     */
    pub fn update(&mut self, delta: i32) {
        if !self.active {
            return;
        }

        self.elapsed += delta;
        if self.elapsed >= DURATION {
            self.active = false;
        }
    }

    /**
     * 获取当前动画进度 [0.0, 1.0]。
     * 用于构造 ExplosionSnapshot 同步给客户端。
     * 客户端据此渲染爆炸大小和透明度。
     *
     * @returns 动画进度
     */
    pub fn progress(&self) -> f32 {
        (self.elapsed as f32 / DURATION as f32).min(1.0)
    }

    /**
     * 获取当前爆炸半径。
     * 当前未直接调用（progress 已足够客户端渲染），保留供未来扩展。
     *
     * @returns 当前半径（像素）
     */
    pub fn current_radius(&self) -> f64 {
        self.max_radius * self.progress() as f64
    }
}
