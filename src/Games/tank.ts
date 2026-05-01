import { Container, Sprite, Texture } from 'pixi.js';
import Bullet from './bullet';
import { WallSegment } from './mapGenerator';

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

class Tank extends Container {
  gun: Sprite;
  body: Sprite;
  isDead: boolean = false;
  speed: number = 3;
  bulletLimit: number = 10;
  isLocked: boolean = false;
  shotsRemaining: number = 10;
  bullets: Bullet[] = [];
  lastFireTime: number = 0;
  fireInterval: number = 200; // 子弹发射间隔（毫秒）
  isSpaceHeld: boolean = false;
  radius: number = 15;
  bulletMode: 'bounces' | 'time' = 'time';

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

  moveForward(walls: WallSegment[]) {
    const dx = Math.cos(this.rotation) * this.speed;
    const dy = Math.sin(this.rotation) * this.speed;
    this.tryMove(dx, dy, walls);
  }

  moveBackward(walls: WallSegment[]) {
    const dx = -Math.cos(this.rotation) * this.speed;
    const dy = -Math.sin(this.rotation) * this.speed;
    this.tryMove(dx, dy, walls);
  }

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

  turnLeft() {
    this.rotation -= 0.05;
  }

  turnRight() {
    this.rotation += 0.05;
  }

  canFire(currentTime: number): boolean {
    if (this.isDead) return false;
    if (this.shotsRemaining <= 0) return false;
    if (!this.isSpaceHeld) return false;

    if (currentTime - this.lastFireTime < this.fireInterval) return false;

    return true;
  }

  fire(stage: Container, currentTime: number) {
    if (!this.canFire(currentTime)) return;

    const bullet = new Bullet(this.x, this.y, this.rotation, this.bulletMode);
    stage.addChild(bullet);
    this.bullets.push(bullet);
    this.shotsRemaining--;
    this.lastFireTime = currentTime;
  }

  onSpaceDown() {
    this.isSpaceHeld = true;
  }

  onSpaceUp() {
    this.isSpaceHeld = false;
    this.shotsRemaining = this.bulletLimit;
  }

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

  die() {
    this.isDead = true;
    this.visible = false;
  }
}

export default Tank;
