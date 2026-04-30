import { onMount, onCleanup } from "solid-js";
import * as PIXI from "pixi.js";

interface Bullet extends PIXI.Graphics {
  vx: number;
  vy: number;
  bounces: number;
}

const TankGame = () => {
  let gameContainer: HTMLDivElement | undefined;
  const app = new PIXI.Application();

  onMount(async () => {
    // 1. 初始化画布
    await app.init({ width: 800, height: 600, backgroundColor: 0xeeeeee });
    if (gameContainer) gameContainer.appendChild(app.canvas);

    // 2. 创建坦克 (一个简单的矩形 + 炮管)
    const tank = new PIXI.Container();
    const body = new PIXI.Graphics().rect(-15, -15, 30, 30).fill(0x3b82f6);
    const gun = new PIXI.Graphics().rect(0, -4, 25, 8).fill(0x1e293b);
    tank.addChild(body, gun);
    tank.x = 400;
    tank.y = 300;
    app.stage.addChild(tank);

    // 3. 状态管理
    const keys: Record<string, boolean> = {};
    const bullets: Bullet[] = [];
    const bulletSpeed = 5;

    // 4. 输入监听
    window.addEventListener("keydown", (e) => (keys[e.code] = true));
    window.addEventListener("keyup", (e) => (keys[e.code] = false));
    window.addEventListener("keypress", (e) => {
      if (e.code === "Space") fire();
    });

    const fire = () => {
      const b = new PIXI.Graphics().circle(0, 0, 4).fill(0xff0000) as Bullet;
      b.x = tank.x + Math.cos(tank.rotation) * 30;
      b.y = tank.y + Math.sin(tank.rotation) * 30;
      b.vx = Math.cos(tank.rotation) * bulletSpeed;
      b.vy = Math.sin(tank.rotation) * bulletSpeed;
      b.bounces = 0;
      app.stage.addChild(b);
      bullets.push(b);
    };

    // 5. 游戏循环
    app.ticker.add(() => {
      // 坦克移动逻辑
      if (keys["ArrowLeft"]) tank.rotation -= 0.05;
      if (keys["ArrowRight"]) tank.rotation += 0.05;
      if (keys["ArrowUp"]) {
        tank.x += Math.cos(tank.rotation) * 3;
        tank.y += Math.sin(tank.rotation) * 3;
      }

      // 子弹移动与反弹逻辑
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        // 边界检测 (模拟墙壁反弹)
        if (b.x < 0 || b.x > 800) { b.vx *= -1; b.bounces++; }
        if (b.y < 0 || b.y > 600) { b.vy *= -1; b.bounces++; }

        // 5秒后或反弹次数过多销毁子弹
        if (b.bounces > 5) {
          app.stage.removeChild(b);
          bullets.splice(i, 1);
        }
      }
    });
  });

  onCleanup(() => {
    app.destroy(true, { children: true });
  });

  return <div ref={gameContainer} />;
};

export default TankGame;