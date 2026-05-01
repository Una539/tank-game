import { Graphics } from 'pixi.js';
import { WallSegment } from './mapGenerator';

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
type DeactivateMode = 'bounces' | 'time';

class Bullet extends Graphics {
  speed: number;
  active: boolean;
  direction: number;
  maxBounces: number = 5; // 最多反弹几次
  bounces: number = 0; // 已反弹次数
  deactiveMode: DeactivateMode;
  maxLifeTime: number = 10000;
  spawnTime: number;

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

  deactivate() {
    this.active = false;
  }
}

export default Bullet;
