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

import { onMount, onCleanup, createSignal } from 'solid-js';
import * as PIXI from 'pixi.js';
import Tank from './tank';
import { MapGenerator, WallSegment } from './mapGenerator';
import Explosion from './explosion';
import { GameClient } from '../network/client';
import type {
  PlayerSnapshot,
  BulletSnapshot,
  ExplosionSnapshot,
} from '../network/types';

/**
 * TankGame 组件的 Props 接口。
 * 使用 TypeScript 接口而非类型别名：在 SolidJS 社区中，接口更常用于组件 Props，
 * 因为接口支持声明合并，便于未来扩展。
 */
interface TankGameProps {
  /** 游戏模式：'local' 为本地单人，'multiplayer' 为联网多人。决定输入处理和状态同步策略。 */
  mode: 'local' | 'multiplayer';

  /** 联网模式下的 WebSocket 客户端。本地模式下为 undefined。 */
  client?: GameClient;

  /** 联网模式下由服务器生成的地图墙壁数据。本地模式下使用 MapGenerator 自动生成。 */
  serverWalls?: WallSegment[];

  /** 当前玩家的服务器分配 ID。用于在 State 包中识别自己。 */
  playerId?: string;

  /** 游戏结束回调。由父组件 App.tsx 注册，用于切换回菜单或大厅。 */
  onGameOver?: () => void;
}

/**
 * 坦克游戏主组件。
 * 这是整个游戏的核心渲染和逻辑入口，负责：
 * 1. 初始化 Pixi.js 画布（800×800）
 * 2. 加载资源（gun.svg, body.svg）
 * 3. 处理键盘输入
 * 4. 运行游戏循环（本地物理 or 多人同步）
 * 5. 管理游戏对象生命周期（坦克、子弹、爆炸）
 *
 * 与后端 `server/src/game/state.rs` 的 `GameState` 对应：
 * 本地模式下前端自主运行完整物理，多人模式下前端只做预测+校正，权威状态来自服务器。
 */
const TankGame = (props: TankGameProps) => {
  /** 游戏容器的 DOM 引用。Pixi.js 的 canvas 将被挂载到此 div 中。 */
  let gameContainer: HTMLDivElement | undefined;

  /** Pixi.js 应用实例。负责渲染循环和场景管理。 */
  const app = new PIXI.Application();

  /** 上一帧空格键是否被按下。用于检测"按下瞬间"（edge trigger），而非持续按住。 */
  let wasSpacePressed = false;

  /** 键盘按下事件处理器引用。onCleanup 中需要移除监听，所以保存引用。 */
  let onKeyDown: ((e: KeyboardEvent) => void) | undefined;

  /** 键盘松开事件处理器引用。 */
  let onKeyUp: ((e: KeyboardEvent) => void) | undefined;

  /** 本地 tick 计数器。多人模式下用于输入同步的时序标记。 */
  let tickCount = 0;

  /** 游戏结束状态信号。SolidJS 的细粒度响应式原语，true 时停止游戏循环更新。 */
  const [gameOver, setGameOver] = createSignal(false);

  /**
   * 组件挂载时初始化游戏。
   * SolidJS 的 onMount 在 DOM 插入后执行，适合初始化需要 DOM 的库（如 Pixi.js）。
   */
  onMount(async () => {
    // 初始化 Pixi.js 应用。800×800 是固定画布尺寸，与后端地图尺寸（16×16×50=800）匹配。
    await app.init({ width: 800, height: 800, backgroundColor: 0xeeeeee });
    if (gameContainer) gameContainer.appendChild(app.canvas);

    // 并行加载纹理资源。Promise.all 确保两个资源同时加载，减少等待时间。
    const [gunTexture, bodyTexture] = await Promise.all([
      PIXI.Assets.load('assets/gun.svg'),
      PIXI.Assets.load('assets/body.svg'),
    ]);

    /**
     * 地图墙壁数据。
     * 多人模式下使用服务器下发的墙壁（确保所有客户端地图一致），
     * 本地模式下使用 MapGenerator 生成随机迷宫。
     * 0.15 是 loopProbability，控制迷宫的环路密度，与后端 `Map::generate(0.15)` 一致。
     */
    const wallsData: WallSegment[] =
      props.mode === 'multiplayer' && props.serverWalls
        ? props.serverWalls
        : new MapGenerator(16, 16, 50).generate(0.15);

    // 绘制地图墙壁。使用 PIXI.Graphics 而非 Sprite：墙壁是线条，Graphics 更轻量。
    const mapGraphics = new PIXI.Graphics();
    mapGraphics.setStrokeStyle({ width: 4, color: 0x333333, cap: 'round' });

    for (const w of wallsData) {
      mapGraphics.moveTo(w.x1, w.y1);
      mapGraphics.lineTo(w.x2, w.y2);
    }
    mapGraphics.stroke();
    app.stage.addChild(mapGraphics);

    // 创建玩家坦克。初始位置 (75, 75) 是左上角出生点，与后端 `positions[(75.0, 75.0)]` 对应。
    const tank1 = new Tank(gunTexture, bodyTexture, 75, 75);
    app.stage.addChild(tank1);

    /** 当前按键状态。Record<string, boolean> 是处理任意按键的通用做法。 */
    const keys: Record<string, boolean> = {};

    /** 本地爆炸效果列表。本地模式下用于渲染击中爆炸；多人模式下也用于本地预测的爆炸。 */
    const explosions: Explosion[] = [];

    /** 本地坦克列表。本地模式下只有 tank1；预留多坦克扩展。 */
    const tanks = [tank1];

    /**
     * 其他玩家的坦克映射。
     * Key 为玩家 ID（服务器分配的 UUID），Value 包含容器和坦克实例。
     * 使用 Map 而非 Object：Map 的 key 可以是任意类型，且迭代顺序稳定。
     */
    const otherTanks: Map<string, { container: PIXI.Container; tank: Tank }> =
      new Map();

    /**
     * 子弹精灵映射。
     * Key 为子弹 ID（服务器分配），Value 为 PIXI.Graphics 精灵。
     * 使用 Map 便于按 ID 快速查找和更新，是游戏对象管理的常见做法。
     */
    const bulletSprites: Map<number, PIXI.Graphics> = new Map();

    /**
     * 子弹生成时间映射。
     * Key 为子弹 ID，Value 为生成时间戳。用于清理超期子弹（10秒保护）。
     */
    const bulletSpawnTimes: Map<number, number> = new Map();

    /**
     * 爆炸精灵映射。
     * Key 为爆炸 ID（服务器分配），Value 为 Explosion 实例。
     */
    const explosionSprites: Map<number, Explosion> = new Map();

    /**
     * 多人模式下收到的服务器玩家状态。
     * 用于客户端预测后的平滑校正（Reconciliation）。
     * 为什么不直接用 tank1.x/tank1.y：本地预测会立即响应输入，与服务器状态有差异，
     * 需要向服务器状态渐变校正，而非直接覆盖（避免跳变）。
     */
    let serverPlayerState: {
      x: number;
      y: number;
      rotation: number;
      isDead: boolean;
      shotsRemaining: number;
    } | null = null;

    // 注册键盘事件监听
    onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
    };
    onKeyUp = (e: KeyboardEvent) => (keys[e.code] = false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 多人模式：注册网络事件处理器
    if (props.mode === 'multiplayer' && props.client) {
      props.client.onState(
        (
          _tick: number,
          players: PlayerSnapshot[],
          bullets: BulletSnapshot[],
          explosionsData: ExplosionSnapshot[]
        ) => {
          const activePlayerIds = new Set<string>();

          for (const player of players) {
            activePlayerIds.add(player.id);
            const isMe =
              String(player.id) === String(props.playerId) ||
              String(player.id) === String(props.client?.playerId);

            if (isMe) {
              // 保存服务器状态，用于本地预测后的校正
              serverPlayerState = {
                x: player.x,
                y: player.y,
                rotation: player.rotation,
                isDead: player.is_dead,
                shotsRemaining: player.shots_remaining,
              };
              tank1.shotsRemaining = player.shots_remaining;
              if (player.is_dead && !tank1.isDead) {
                tank1.die();
              }
            } else {
              // 更新/创建其他玩家的坦克
              let other = otherTanks.get(player.id);
              if (!other) {
                const container = new PIXI.Container();
                const otherTank = new Tank(
                  gunTexture,
                  bodyTexture,
                  player.x,
                  player.y
                );
                otherTank.rotation = player.rotation;
                container.addChild(otherTank);
                app.stage.addChild(container);
                other = { container, tank: otherTank };
                otherTanks.set(player.id, other);
              }
              other.tank.x = player.x;
              other.tank.y = player.y;
              other.tank.rotation = player.rotation;
              other.tank.shotsRemaining = player.shots_remaining;
              if (player.is_dead && !other.tank.isDead) {
                other.tank.die();
              }
            }
          }

          // 清理已离开的玩家坦克
          for (const [id, other] of otherTanks) {
            if (!activePlayerIds.has(id)) {
              other.container.parent?.removeChild(other.container);
              other.container.destroy({ children: true });
              otherTanks.delete(id);
            }
          }

          // 同步子弹状态
          const activeBulletIds = new Set<number>();
          for (const bullet of bullets) {
            activeBulletIds.add(bullet.id);
            const now = performance.now();

            if (bullet.active) {
              if (!bulletSprites.has(bullet.id)) {
                const sprite = new PIXI.Graphics();
                sprite.rect(-8, -2, 16, 4);
                sprite.fill(0x000000);
                sprite.x = bullet.x;
                sprite.y = bullet.y;
                sprite.rotation = bullet.direction;
                app.stage.addChild(sprite);
                bulletSprites.set(bullet.id, sprite);
                bulletSpawnTimes.set(bullet.id, now);
              } else {
                const sprite = bulletSprites.get(bullet.id)!;
                sprite.x = bullet.x;
                sprite.y = bullet.y;
                sprite.rotation = bullet.direction;
              }

              // 10秒超时清理，防止内存泄漏
              const age = bulletSpawnTimes.get(bullet.id) || now;
              if (now - age > 10000) {
                const sprite = bulletSprites.get(bullet.id);
                if (sprite) {
                  sprite.parent?.removeChild(sprite);
                  sprite.destroy();
                  bulletSprites.delete(bullet.id);
                  bulletSpawnTimes.delete(bullet.id);
                }
              }
            } else {
              const sprite = bulletSprites.get(bullet.id);
              if (sprite) {
                sprite.parent?.removeChild(sprite);
                sprite.destroy();
                bulletSprites.delete(bullet.id);
                bulletSpawnTimes.delete(bullet.id);
              }
            }
          }

          // 清理服务器已删除的子弹
          for (const id of bulletSprites.keys()) {
            if (!activeBulletIds.has(id)) {
              const sprite = bulletSprites.get(id);
              if (sprite) {
                sprite.parent?.removeChild(sprite);
                sprite.destroy();
              }
              bulletSprites.delete(id);
              bulletSpawnTimes.delete(id);
            }
          }

          // 同步爆炸效果
          for (const exp of explosionsData) {
            if (!explosionSprites.has(exp.id)) {
              const sprite = new Explosion(exp.x, exp.y);
              app.stage.addChild(sprite);
              explosionSprites.set(exp.id, sprite);
            }
          }
        }
      );

      props.client.onGameOver(() => {
        setGameOver(true);
        props.onGameOver?.();
      });
    }

    // 游戏主循环，每帧调用
    app.ticker.add(() => {
      if (gameOver()) return;

      const dt = app.ticker.deltaMS / 1000;

      const currentTime = performance.now();

      if (props.mode === 'local') {
        // ===== 本地模式：自主运行完整物理 =====
        if (keys['ArrowLeft'] || keys['KeyA']) tank1.turnLeft();
        if (keys['ArrowRight'] || keys['KeyD']) tank1.turnRight();
        if (keys['ArrowUp'] || keys['KeyW']) tank1.moveForward(wallsData);
        if (keys['ArrowDown'] || keys['KeyS']) tank1.moveBackward(wallsData);

        const spacePressed = keys['Space'];

        // Edge trigger 检测：只在空格按下瞬间触发 onSpaceDown
        if (spacePressed && !wasSpacePressed) {
          tank1.onSpaceDown();
          tank1.fire(app.stage, currentTime);
        } else if (spacePressed && wasSpacePressed) {
          // 持续按住：若弹夹未空则继续发射
          if (tank1.shotsRemaining > 0) {
            tank1.fire(app.stage, currentTime);
          }
        } else if (!spacePressed && wasSpacePressed) {
          tank1.onSpaceUp();
        }

        // 本地碰撞检测：所有坦克的子弹检测是否击中其他坦克
        for (const shooter of tanks) {
          for (const bullet of shooter.bullets) {
            if (!bullet.active) continue;
            // 200ms 出生保护期，防止自伤
            if (performance.now() - bullet.spawnTime < 200) continue;

            for (const target of tanks) {
              if (target.isDead) continue;
              const dx = bullet.x - target.x;
              const dy = bullet.y - target.y;
              if (Math.sqrt(dx * dx + dy * dy) < target.radius + 8) {
                bullet.deactivate();
                target.die();
                const exp = new Explosion(target.x, target.y);
                app.stage.addChild(exp);
                explosions.push(exp);
              }
            }
          }
        }
      } else if (props.mode === 'multiplayer' && props.client) {
        // ===== 多人模式：客户端预测 + 服务器校正 =====
        tickCount++;

        // 本地预测：立即响应输入，给玩家零延迟的操控感
        if (!tank1.isDead) {
          if (keys['ArrowLeft'] || keys['KeyA']) tank1.turnLeft();
          if (keys['ArrowRight'] || keys['KeyD']) tank1.turnRight();
          if (keys['ArrowUp'] || keys['KeyW']) tank1.moveForward(wallsData);
          if (keys['ArrowDown'] || keys['KeyS']) tank1.moveBackward(wallsData);
        }

        /**
         * 构造按键状态包。使用 !! 将可能的 undefined 转为布尔值，
         * 避免序列化时携带 undefined（JSON 不支持 undefined）。
         * 与后端 `server/src/protocol/packets.rs` 的 `KeyState` 结构对应。
         */
        const keyState = {
          up: !!(keys['ArrowUp'] || keys['KeyW']),
          down: !!(keys['ArrowDown'] || keys['KeyS']),
          left: !!(keys['ArrowLeft'] || keys['KeyA']),
          right: !!(keys['ArrowRight'] || keys['KeyD']),
          fire: !!keys['Space'],
        };

        // 发送输入给服务器
        props.client.sendInput(keyState, tickCount);

        // Edge trigger 发送开火请求
        if (keys['Space'] && !wasSpacePressed) {
          props.client.sendFire();
        }

        // 向服务器状态平滑校正（Reconciliation）
        if (serverPlayerState && !tank1.isDead) {
          // correctionSpeed = 0.15：每帧向服务器状态移动 15% 的差值。
          // 这是客户端预测的常见做法：完全覆盖会导致跳变（snapping），
          // 完全信任本地会累积误差。0.15 是经验和手感调优的结果。
          const correctionSpeedPerSecond = 9;

          const factor = 1 - Math.exp(-correctionSpeedPerSecond * dt);
          tank1.x += (serverPlayerState.x - tank1.x) * factor;
          tank1.y += (serverPlayerState.y - tank1.y) * factor;

          // 角度差归一化到 [-π, π]，避免绕远路旋转
          let rotDiff = serverPlayerState.rotation - tank1.rotation;
          while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
          while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
          tank1.rotation += rotDiff * factor;
        }
      }

      // 更新本地爆炸效果
      for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.update(app.ticker.deltaMS);
        if (!exp.active) {
          exp.parent?.removeChild(exp);
          exp.destroy();
          explosions.splice(i, 1);
        }
      }

      // 更新服务器同步的爆炸效果
      for (const [id, exp] of explosionSprites) {
        exp.update(app.ticker.deltaMS);
        if (!exp.active) {
          exp.parent?.removeChild(exp);
          exp.destroy();
          explosionSprites.delete(id);
        }
      }

      // 本地模式：更新坦克子弹和碰撞
      if (props.mode === 'local') {
        for (const tank of tanks) {
          if (!tank.isDead) tank.updateWithCollision(wallsData);
        }
      }

      wasSpacePressed = keys['Space'];
    });
  });

  // 组件卸载时清理资源
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown!);
    window.removeEventListener('keyup', onKeyUp!);
    app.destroy(true, { children: true });
  });

  return <div ref={gameContainer} />;
};

export default TankGame;
