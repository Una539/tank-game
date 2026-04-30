import { Graphics } from 'pixi.js';

class Bullet extends Graphics {
  speed: number;
  active: boolean;
  direction: number;
  maxBounces: number = 5; // 最多反弹几次
  bounces: number = 0; // 已反弹次数

  constructor(x: number, y: number, angle: number) {
    super();

    this.speed = 10;
    this.direction = angle;
    this.active = true;

    this.rect(-8, -2, 16, 4);
    this.fill({ color: 0x000000 });

    this.x = x + Math.cos(angle) * 30;
    this.y = y + Math.sin(angle) * 30;
    this.rotation = angle;
  }

  update(screenW: number, screenH: number) {
    if (!this.active) return;

    this.x += Math.cos(this.direction) * this.speed;
    this.y += Math.sin(this.direction) * this.speed;

    if (this.x <= 0 || this.x >= screenW) {
      this.direction = Math.PI - this.direction;
      this.bounces++;
    }
    if (this.y <= 0 || this.y >= screenH) {
      this.direction = -this.direction;
      this.bounces++;
    }
    if (this.bounces >= this.maxBounces) {
      this.deactivate();
    }
    this.rotation = this.direction;
  }

  deactivate() {
    this.active = false;
  }
}

export default Bullet;
