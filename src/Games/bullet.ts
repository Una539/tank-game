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

import { Graphics } from 'pixi.js';
import { WallSegment } from './mapGenerator';

/**
 * 判断两条线段是否相交。
 * 使用参数方程法（行列式求解），是计算几何中的经典算法。
 * 为什么不直接用 Pixi.js 的碰撞检测：因为墙壁是数学线段而非 DisplayObject，
 * 且我们需要线段级别的精确相交判定，而非包围盒近似。
 *
 * @param x1 - 线段1起点 X
 * @param y1 - 线段1起点 Y
 * @param x2 - 线段1终点 X
 * @param y2 - 线段1终点 Y
 * @param x3 - 线段2起点 X
 * @param y3 - 线段2起点 Y
 * @param x4 - 线段2终点 X
 * @param y4 - 线段2终点 Y
 * @returns true 表示两线段相交（不含端点）
 */
function linesIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
): boolean {
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (den === 0) return false;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

/** 子弹失效策略类型。'bounces' 按反弹次数，'time' 按存活时间。 */
type DeactivateMode = 'bounces' | 'time';

/**
 * 子弹实体类，继承自 PIXI.Graphics。
 * 使用 Graphics 而非 Sprite：子弹是简单几何形状（黑色矩形），
 * 用代码绘制比加载纹理更轻量，且无需额外资源文件。
 * 本类与后端 `server/src/game/bullet.rs` 中的 `Bullet` 结构体保持逻辑一致。
 */
class Bullet extends Graphics {
  /** 子弹飞行速度（像素/帧）。固定为 2，与后端 `SPEED` 常量一致。 */
  speed: number;

  /** 子弹是否仍然存活。false 表示已超时或反弹耗尽，将被清理。 */
  active: boolean;

  /** 飞行方向（弧度）。0 表示正右方，与坦克 rotation 同体系。 */
  direction: number;

  /** 最多反弹次数。5 次是经典坦克大战的舒适数值：足够利用墙壁战术，又不会无限反弹。 */
  maxBounces: number = 5;

  /** 已反弹次数。达到 maxBounces 时子弹失效。 */
  bounces: number = 0;

  /** 子弹失效策略。当前默认 'time'，与后端 `BulletMode::Time` 对应。 */
  deactiveMode: DeactivateMode;

  /** 最大存活时间（毫秒）。10000ms = 10秒，与后端 `MAX_LIFETIME` 一致。 */
  maxLifeTime: number = 10000;

  /** 子弹生成时间戳（performance.now()）。用于计算存活时间。 */
  spawnTime: number;

  /**
   * 创建子弹实例。
   *
   * @param x - 发射起点 X 坐标（坦克位置）
   * @param y - 发射起点 Y 坐标（坦克位置）
   * @param angle - 发射方向（弧度），通常取自坦克 rotation
   * @param mode - 子弹失效策略，默认 'time'
   *
   * 为什么 bullet 初始位置要偏移 30 像素：避免子弹生成时与坦克自身发生碰撞。
   * 这与后端 `BULLET_SPAWN_OFFSET` 常量对应。
   * 为什么用 rect(-8, -2, 16, 4)：16×4 的细长矩形视觉上更像子弹，
   * 负坐标使中心点在 (0,0)，便于旋转。
   */
  constructor(
    x: number,
    y: number,
    angle: number,
    mode: DeactivateMode = 'time'
  ) {
    super();

    this.speed = 2;
    this.direction = angle;
    this.active = true;

    this.rect(-8, -2, 16, 4);
    this.fill({ color: 0x000000 });

    this.x = x + Math.cos(angle) * 30;
    this.y = y + Math.sin(angle) * 30;
    this.rotation = angle;

    this.deactiveMode = mode;
    this.spawnTime = performance.now();
  }

  /**
   * 更新子弹位置并检测墙壁碰撞。
   * 每帧调用一次，是子弹运动的核心逻辑。
   * 与后端 `server/src/game/bullet.rs` 的 `update` 方法逻辑一致。
   *
   * @param walls - 当前地图的所有墙壁线段
   */
  update(walls: WallSegment[]) {
    if (!this.active) return;

    // 计算下一步的位置
    const nextX = this.x + Math.cos(this.direction) * this.speed;
    const nextY = this.y + Math.sin(this.direction) * this.speed;

    let hasBouncedThisFrame = false;

    // 遍历所有墙壁检测碰撞
    for (const wall of walls) {
      if (
        linesIntersect(
          this.x,
          this.y,
          nextX,
          nextY,
          wall.x1,
          wall.y1,
          wall.x2,
          wall.y2
        )
      ) {
        // 判断是水平墙还是垂直墙
        if (wall.y1 === wall.y2) {
          // 撞到水平墙，Y轴速度反转
          this.direction = -this.direction;
        } else {
          // 撞到垂直墙，X轴速度反转
          this.direction = Math.PI - this.direction;
        }

        this.bounces++;
        hasBouncedThisFrame = true;
        break; // 一帧只反弹一次，防止卡在墙角
      }
    }

    if (this.deactiveMode === 'bounces') {
      if (this.bounces >= this.maxBounces) {
        this.deactivate();
        return;
      }
    } else if (this.deactiveMode === 'time') {
      if (performance.now() - this.spawnTime >= this.maxLifeTime) {
        this.deactivate();
        return;
      }
    }

    // 如果发生了反弹，这一帧就不往前走了，下一帧再按照新方向走
    if (!hasBouncedThisFrame) {
      this.x = nextX;
      this.y = nextY;
    }

    this.rotation = this.direction;
  }

  /**
   * 使子弹失效。设置 active = false，将在下一帧被清理。
   * 与后端 `server/src/game/bullet.rs` 的 `deactivate` 方法对应。
   */
  deactivate() {
    this.active = false;
  }
}

export default Bullet;
