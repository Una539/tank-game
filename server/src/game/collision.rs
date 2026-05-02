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

//! Collision detection utilities
//! 本模块提供碰撞检测工具函数，是游戏物理的核心。
//! 与前端 `src/Games/tank.ts` 的 `pointToSegmentDistance` 函数逻辑一致，
//! 确保前后端碰撞判定结果相同。

use super::map::WallSegment;

/**
 * 检测给定点是否与任何墙壁发生碰撞。
 * 使用"点到线段距离"算法：计算点到每面墙的最短距离，小于 radius 则撞墙。
 * 为什么不用 AABB（轴对齐包围盒）：地图墙壁是任意线段，AABB 只适用于矩形碰撞。
 *
 * @param nx - 待检测点的 X 坐标
 * @param ny - 待检测点的 Y 坐标
 * @param radius - 碰撞半径
 * @param walls - 所有墙壁线段
 * @returns true 表示发生碰撞
 */
pub fn check_collision(nx: f64, ny: f64, radius: f64, walls: &[WallSegment]) -> bool {
    for wall in walls {
        let dist = point_to_segment_distance(
            nx, ny,
            wall.x1, wall.y1,
            wall.x2, wall.y2,
        );
        if dist < radius {
            return true;
        }
    }
    false
}

/**
 * 计算点到线段的最短距离。
 * 这是计算几何中的经典算法，使用参数投影法：
 * 1. 计算点在线段所在直线上的投影参数 t
 * 2. 将 t 限制在 [0, 1]（线段的端点范围内）
 * 3. 计算点到投影点的欧氏距离
 *
 * 与前端 `src/Games/tank.ts` 的 `pointToSegmentDistance` 函数逻辑一致。
 *
 * @param px - 点的 X 坐标
 * @param py - 点的 Y 坐标
 * @param x1 - 线段起点 X
 * @param y1 - 线段起点 Y
 * @param x2 - 线段终点 X
 * @param y2 - 线段终点 Y
 * @returns 点到线段的最短距离
 */
fn point_to_segment_distance(
    px: f64, py: f64,
    x1: f64, y1: f64,
    x2: f64, y2: f64,
) -> f64 {
    let l2 = (x2 - x1).powi(2) + (y2 - y1).powi(2);
    if l2 == 0.0 {
        return ((px - x1).powi(2) + (py - y1).powi(2)).sqrt();
    }

    let mut t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = t.clamp(0.0, 1.0);

    let dx = px - (x1 + t * (x2 - x1));
    let dy = py - (y1 + t * (y2 - y1));
    (dx * dx + dy * dy).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collision() {
        let walls = vec![super::WallSegment {
            x1: 0.0, y1: 0.0,
            x2: 100.0, y2: 0.0,
            wall_type: super::super::WallType::Horizontal,
        }];

        assert!(check_collision(50.0, 5.0, 10.0, &walls));
        assert!(!check_collision(50.0, 20.0, 10.0, &walls));
    }
}
