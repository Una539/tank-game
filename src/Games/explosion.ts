import { Container, Graphics } from 'pixi.js';

class Explosion extends Container {
  private elapsed: number = 0;
  private duration: number = 500; // 动画持续毫秒
  active: boolean = true;

  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
    this.drawFrame(0);
  }

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

  update(delta: number) {
    if (!this.active) return;
    this.elapsed += delta;
    const progress = Math.min(this.elapsed / this.duration, 1);
    this.drawFrame(progress);
    if (progress >= 1) this.active = false;
  }
}

export default Explosion;
