import { Graphics, Container, FillInput } from 'pixi.js';
import Bullet from './bullet';

class Tank extends Container {
  gun: Graphics;
  body: Graphics;
  speed: number = 3;
  bulletLimit: number = 10;
  isLocked: boolean = false;
  shotsRemaining: number = 10;
  bullets: Bullet[] = [];
  lastFireTime: number = 0;
  fireInterval: number = 200; // 子弹发射间隔（毫秒）
  isSpaceHeld: boolean = false;

  constructor(gunColor: FillInput, bodyColor: FillInput, x: number, y: number) {
    super();
    this.gun = new Graphics().rect(0, -4, 25, 8).fill(gunColor);
    this.body = new Graphics().rect(-15, -15, 30, 30).fill(bodyColor);
    this.addChild(this.body, this.gun);
    this.x = x;
    this.y = y;
  }

  moveForward() {
    this.x += Math.cos(this.rotation) * this.speed;
    this.y += Math.sin(this.rotation) * this.speed;
  }

  moveBackward() {
    this.x -= Math.cos(this.rotation) * this.speed;
    this.y -= Math.sin(this.rotation) * this.speed;
  }

  turnLeft() {
    this.rotation -= 0.05;
  }

  turnRight() {
    this.rotation += 0.05;
  }

  canFire(currentTime: number): boolean {
    console.log(
      'isSpaceHeld:',
      this.isSpaceHeld,
      'shotsRemaining:',
      this.shotsRemaining
    );
    if (this.shotsRemaining <= 0) return false;
    if (!this.isSpaceHeld) return false;

    if (currentTime - this.lastFireTime < this.fireInterval) return false;

    return true;
  }

  fire(stage: Container, currentTime: number) {
    if (!this.canFire(currentTime)) return;

    const bullet = new Bullet(this.x, this.y, this.rotation);
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

  update(screenW: number, screenH: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.update(screenW, screenH);

      // 子弹失活 → 从场景和数组中移除
      if (!b.active) {
        b.parent?.removeChild(b);
        b.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }
}

export default Tank;
