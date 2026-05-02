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

import { Container, Graphics } from 'pixi.js';

/**
 * 爆炸效果实体类，继承自 PIXI.Container。
 * 用于坦克被击中时的视觉效果。
 * 与后端 `server/src/game/explosion.rs` 的 `Explosion` 结构体保持逻辑一致，
 * 确保前后端爆炸动画的进度同步。
 */
class Explosion extends Container {
  /** 已过去的动画时间（毫秒）。 */
  private elapsed: number = 0;

  /** 动画总持续时间（毫秒）。500ms = 0.5秒，是爆炸效果的舒适时长：足够明显又不会拖沓。 */
  private duration: number = 500;

  /** 爆炸是否仍然活跃。false 时将在下一帧被清理。 */
  active: boolean = true;

  /**
   * 创建爆炸实例。
   *
   * @param x - 爆炸中心 X 坐标（通常为被击中坦克的位置）
   * @param y - 爆炸中心 Y 坐标
   */
  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
    this.drawFrame(0);
  }

  /**
   * 绘制指定进度的爆炸帧。
   * 使用两层同心圆：外圈橙色（火焰）+ 内圈黄色（亮心），营造爆炸的层次感。
   * 为什么用 Graphics 而非 Sprite：爆炸是动态变化的形状，代码绘制比预渲染动画更灵活且省资源。
   *
   * @param progress - 动画进度 [0, 1]
   */
  private drawFrame(progress: number) {
    this.removeChildren();
    const maxRadius = 40;
    const r = maxRadius * progress;
    const alpha = 1 - progress;

    // 外圈火焰
    const outer = new Graphics()
      .circle(0, 0, r)
      .fill({ color: 0xff4500, alpha });
    // 内圈亮心
    const inner = new Graphics()
      .circle(0, 0, r * 0.5)
      .fill({ color: 0xffff00, alpha });

    this.addChild(outer, inner);
  }

  /**
   * 更新爆炸动画。
   * 每帧调用，根据经过的时间更新进度并重绘。
   * 与后端 `server/src/game/explosion.rs` 的 `update` 方法对应，
   * 但后端使用固定 33ms delta，前端使用实际帧间隔（更平滑）。
   *
   * @param delta - 本帧经过的时间（毫秒）
   */
  update(delta: number) {
    if (!this.active) return;
    this.elapsed += delta;
    const progress = Math.min(this.elapsed / this.duration, 1);
    this.drawFrame(progress);
    if (progress >= 1) this.active = false;
  }
}

export default Explosion;
