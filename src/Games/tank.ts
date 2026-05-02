import { Container, Sprite, Texture } from 'pixi.js';
import Bullet from './bullet';
import { WallSegment } from './mapGenerator';

/**
 * 计算点到线段的最短距离。
 * 这是 2D 几何中的经典算法，用于坦克与墙壁的碰撞检测。
 * 为什么不直接用 Pixi.js 的 hitTest：因为墙壁是数学线段而非 PIXI.DisplayObject，
 * 且我们需要精确的"点到线段"距离而非矩形包围盒碰撞。
 *
 * @param px - 点的 X 坐标（坦克中心）
 * @param py - 点的 Y 坐标（坦克中心）
 * @param x1 - 线段起点 X
 * @param y1 - 线段起点 Y
 * @param x2 - 线段终点 X
 * @param y2 - 线段终点 Y
 * @returns 点到线段的最短距离（像素）
 */
function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt(
    (px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2
  );
}

/**
 * 坦克游戏实体类，继承自 PIXI.Container。
 * Pixi.js 中"一个游戏对象 = 一个 Container"是社区标准做法，
 * 可将 Sprite、Graphics 等子对象统一管理，也便于整体变换（位移、旋转、缩放）。
 * 本类与后端 `server/src/game/tank.rs` 中的 `Tank` 结构体保持逻辑一致，
 * 确保客户端预测与权威服务器判定的行为对齐。
 */
class Tank extends Container {
  /** 炮塔精灵。使用独立 Sprite 而非合并纹理：炮塔需单独旋转（瞄准方向），车身保持固定朝向。 */
  gun: Sprite;

  /** 车身精灵。anchor 设为 (0.5, 0.5) 使旋转中心在几何中心，避免"绕角旋转"的违和感。 */
  body: Sprite;

  /** 死亡状态标记。false 表示存活，true 表示已被击中。隐藏可见性而非销毁对象：便于复活机制扩展。 */
  isDead: boolean = false;

  /** 移动速度（像素/帧）。当前固定为 3，与后端 `SPEED` 常量保持一致，确保权威服务器判定准确。 */
  speed: number = 3;

  /** 弹夹容量上限。10 发是经典坦克大战的舒适数值：足够压制，又需适时松手换弹。 */
  bulletLimit: number = 10;

  /** 移动锁定标记。当前未使用，预留用于"被击中后短暂僵直"或"道具冻结"等效果。 */
  isLocked: boolean = false;

  /** 当前剩余子弹数。长按空格持续消耗，松手瞬间重置为 `bulletLimit`。 */
  shotsRemaining: number = 10;

  /** 该坦克发出的所有存活子弹。本地模式下用于碰撞检测；多人模式下仅供本地预测显示。 */
  bullets: Bullet[] = [];

  /** 上次发射时间戳（performance.now()）。控制射速，与 `fireInterval` 配合实现冷却。 */
  lastFireTime: number = 0;

  /** 发射冷却间隔（毫秒）。200ms = 5发/秒，与后端 `FIRE_INTERVAL` 一致。 */
  fireInterval: number = 200;

  /** 空格键是否被长按。true 时 `canFire` 返回 true（若冷却完毕），实现按住连发。 */
  isSpaceHeld: boolean = false;

  /** 碰撞半径（像素）。15px 对应车身直径 30px，圆形碰撞盒计算简单且玩家可预测。 */
  radius: number = 15;

  /** 子弹失效策略。'time' = 10秒后自动消失（当前使用），'bounces' = 反弹5次后消失。 */
  bulletMode: 'bounces' | 'time' = 'time';

  /**
   * 创建坦克实例。
   *
   * @param gunTexture - 炮塔纹理，由 PIXI.Assets.load 异步加载
   * @param bodyTexture - 车身纹理
   * @param x - 初始 X 坐标，通常取地图角落（如 75）避免出生撞墙
   * @param y - 初始 Y 坐标
   *
   * 为什么用 Texture 而非直接加载路径：Pixi.js v8 要求先通过 Assets.load 加载资源，
   * 获得 Texture 后再创建 Sprite，这是 v8 的资源管理最佳实践。
   * 为什么 width/height 设为 30：对应 radius 15，直径 30px，视觉上比例协调。
   */
  constructor(gunTexture: Texture, bodyTexture: Texture, x: number, y: number) {
    super();
    this.body = new Sprite(bodyTexture);
    this.body.anchor.set(0.5);
    this.body.width = 30; // 对应 radius: 15，直径30
    this.body.height = 30;

    this.gun = new Sprite(gunTexture);
    this.gun.anchor.set(0.5, 0.5); // SVG viewBox 居中，用0.5,0.5
    this.gun.width = 30; // 和车身等宽，视觉上比例合适
    this.gun.height = 30;

    // 层级：先body再gun，gun在上层
    this.addChild(this.body, this.gun);
    this.x = x;
    this.y = y;
  }

  /**
   * 向前移动。计算当前 rotation 方向的位移向量，调用 tryMove 检测碰撞。
   * 为什么不直接修改 x/y：需要处理"碰到墙就沿墙滑动"的经典游戏体验。
   * 与后端 `server/src/game/tank.rs` 的 `move_forward` 方法逻辑一致。
   *
   * @param walls - 当前地图的所有墙壁线段
   */
  moveForward(walls: WallSegment[]) {
    const dx = Math.cos(this.rotation) * this.speed;
    const dy = Math.sin(this.rotation) * this.speed;
    this.tryMove(dx, dy, walls);
  }

  /**
   * 向后移动。与 moveForward 方向相反，使用负的速度向量。
   * 后退速度不减速：简化设计，经典坦克游戏通常前后同速。
   *
   * @param walls - 当前地图的所有墙壁线段
   */
  moveBackward(walls: WallSegment[]) {
    const dx = -Math.cos(this.rotation) * this.speed;
    const dy = -Math.sin(this.rotation) * this.speed;
    this.tryMove(dx, dy, walls);
  }

  /**
   * 尝试移动，带滑动碰撞（Sliding Collision）。
   * 这是 2D 俯视射击游戏的标配物理：
   * 1. 优先尝试完整位移（dx + dy）
   * 2. 若撞墙，尝试仅 X 轴位移
   * 3. 若仍撞墙，尝试仅 Y 轴位移
   * 4. 两轴都失败则停止
   *
   * 这种"分解移动"让玩家沿墙滑过，避免完全卡死的挫败感。
   * 与后端 `server/src/game/tank.rs` 的 `try_move` 方法逻辑一致。
   *
   * @param dx - X 轴位移量
   * @param dy - Y 轴位移量
   * @param walls - 当前地图的所有墙壁线段
   */
  private tryMove(dx: number, dy: number, walls: WallSegment[]) {
    // 优先尝试完整移动
    if (!this.checkCollision(this.x + dx, this.y + dy, walls)) {
      this.x += dx;
      this.y += dy;
      return;
    }

    // 完整移动失败，尝试只移动 X 轴
    if (!this.checkCollision(this.x + dx, this.y, walls)) {
      this.x += dx;
      return;
    }

    // 尝试只移动 Y 轴
    if (!this.checkCollision(this.x, this.y + dy, walls)) {
      this.y += dy;
    }

    // 两轴都失败则完全停止
  }

  /**
   * 向左旋转。每次减 0.05 弧度（约 2.86°）。
   * 固定步长旋转是经典设计：简单直接，玩家容易建立肌肉记忆。
   * 与后端 `server/src/game/tank.rs` 的 `turn_left` 方法逻辑一致。
   */
  turnLeft() {
    this.rotation -= 0.05;
  }

  /**
   * 向右旋转。每次加 0.05 弧度（约 2.86°）。
   * 与后端 `server/src/game/tank.rs` 的 `turn_right` 方法逻辑一致。
   */
  turnRight() {
    this.rotation += 0.05;
  }

  /**
   * 判断当前是否可以发射。包含四层判定：
   * 1. 是否死亡
   * 2. 弹夹是否为空
   * 3. 空格键是否被按住
   * 4. 冷却是否结束
   *
   * 返回 boolean 而非抛出异常：调用处通常是简单条件判断，bool 最简洁。
   * 与后端 `server/src/game/tank.rs` 的 `can_fire` 方法逻辑一致。
   *
   * @param currentTime - 当前时间戳（performance.now()）
   * @returns true 表示可以发射
   */
  canFire(currentTime: number): boolean {
    if (this.isDead) return false;
    if (this.shotsRemaining <= 0) return false;
    if (!this.isSpaceHeld) return false;

    if (currentTime - this.lastFireTime < this.fireInterval) return false;

    return true;
  }

  /**
   * 发射子弹。创建 Bullet 实例并加入场景和 bullets 数组。
   * 为什么不返回 Bullet：直接加入场景更简洁，Pixi.js 中"创建即显示"是常见模式。
   * 与后端 `server/src/game/tank.rs` 的 `fire` 方法逻辑一致，
   * 但后端返回 Option<Bullet> 以便解耦测试，前端直接显示。
   *
   * @param stage - Pixi.js 场景容器，子弹将被添加到此容器中
   * @param currentTime - 当前时间戳（performance.now()）
   */
  fire(stage: Container, currentTime: number) {
    if (!this.canFire(currentTime)) return;

    const bullet = new Bullet(this.x, this.y, this.rotation, this.bulletMode);
    stage.addChild(bullet);
    this.bullets.push(bullet);
    this.shotsRemaining--;
    this.lastFireTime = currentTime;
  }

  /**
   * 空格键按下事件。设置 isSpaceHeld = true，启动连发状态。
   * 为什么有 onSpaceDown/onSpaceUp 两个方法：分离按键按下和松开逻辑，
   * 是游戏输入处理的标准做法（Input Event Pattern），便于扩展"短按/长按"区分。
   * 与后端 `server/src/game/tank.rs` 的 `on_fire_down` 方法对应。
   */
  onSpaceDown() {
    this.isSpaceHeld = true;
  }

  /**
   * 空格键松开事件。重置 isSpaceHeld 并补满弹夹。
   * "松手换弹"机制给玩家策略选择：持续压制（长按）or 节奏点射（短按）。
   * 与后端 `server/src/game/tank.rs` 的 `on_fire_up` 方法对应。
   */
  onSpaceUp() {
    this.isSpaceHeld = false;
    this.shotsRemaining = this.bulletLimit;
  }

  /**
   * 更新子弹状态并清理失效子弹。本地模式下每帧调用。
   * 倒序遍历（i--）：删除数组元素时不影响未遍历的索引，是数组删除的标准技巧。
   * 与后端 `server/src/game/tank.rs` 的 `update_bullets` 方法逻辑一致。
   *
   * @param walls - 当前地图的所有墙壁线段
   */
  update(walls: WallSegment[]) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.update(walls);

      // 子弹失活 → 从场景和数组中移除
      if (!b.active) {
        b.parent?.removeChild(b);
        b.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  /**
   * 检测给定坐标是否与墙壁碰撞。
   * 使用"点到线段距离"算法：计算坦克中心到每面墙的最短距离，小于 radius 则撞墙。
   * 为什么不用 AABB（轴对齐包围盒）：地图墙壁是任意线段，AABB 只适用于矩形碰撞。
   * 与后端 `server/src/game/collision.rs` 的 `check_collision` 函数逻辑一致。
   *
   * @param nx - 待检测的 X 坐标
   * @param ny - 待检测的 Y 坐标
   * @param walls - 当前地图的所有墙壁线段
   * @returns true 表示发生碰撞
   */
  checkCollision(nx: number, ny: number, walls: WallSegment[]): boolean {
    for (const wall of walls) {
      // 计算坦克中心点到墙线段的距离
      const dist = pointToSegmentDistance(
        nx,
        ny,
        wall.x1,
        wall.y1,
        wall.x2,
        wall.y2
      );
      // 如果距离小于坦克半径，则视为撞墙
      if (dist < this.radius) return true;
    }
    return false;
  }

  /**
   * 更新子弹 + 碰撞检测的合并方法。本地模式主循环调用。
   * 与 update() 的区别：update() 只做子弹更新，此方法额外包含碰撞检测逻辑。
   * 保留两个版本：update() 便于测试，updateWithCollision() 供主循环使用。
   * 与后端 `server/src/game/state.rs` 的 `process_tick` 中的逻辑对应。
   *
   * @param walls - 当前地图的所有墙壁线段
   */
  updateWithCollision(walls: WallSegment[]) {
    this.bullets.forEach((b) => b.update(walls));
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.update(walls);

      // 子弹失活 → 从场景和数组中移除
      if (!b.active) {
        b.parent?.removeChild(b);
        b.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  /**
   * 坦克死亡。设置 isDead 并隐藏可见性。
   * 不销毁对象：保留 Tank 实例便于复活机制，且避免 PIXI 对象频繁创建/销毁的性能开销。
   * 与后端 `server/src/game/tank.rs` 的 `die` 方法对应。
   */
  die() {
    this.isDead = true;
    this.visible = false;
  }
}

export default Tank;
