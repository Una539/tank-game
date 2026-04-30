import { onMount, onCleanup } from "solid-js";
import * as PIXI from "pixi.js";

// interface Bullet extends PIXI.Graphics {
//   vx: number;
//   vy: number;
//   bounces: number;
// }

class Bullet extends PIXI.Graphics {
  vx: number;
  vy: number;
  life: number;
  speed: number = 3;

  constructor() {
    super();
    this.vx = 0;
    this.vy = 0;
    this.life = 1000;
  }
}

class Tank extends PIXI.Container {
  gun: PIXI.Graphics;
  body: PIXI.Graphics;
  speed: number = 3;

  constructor(
    gunColor: PIXI.FillInput,
    bodyColor: PIXI.FillInput,
    x: number,
    y: number,
  ) {
    super();
    this.gun = new PIXI.Graphics().rect(0, -4, 25, 8).fill(gunColor);
    this.body = new PIXI.Graphics().rect(-15, -15, 30, 30).fill(bodyColor);
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
}

const TankGame = () => {
  let gameContainer: HTMLDivElement | undefined;
  const app = new PIXI.Application();

  onMount(async () => {
    // 1. 初始化画布
    await app.init({ width: 800, height: 600, backgroundColor: 0xeeeeee });
    if (gameContainer) gameContainer.appendChild(app.canvas);

    const tank1 = new Tank(0x3b82f6, 0x1e293b, 300, 300);
    app.stage.addChild(tank1);

    // 3. 状态管理
    const keys: Record<string, boolean> = {};
    // const bullets: Bullet[] = [];
    // const bulletSpeed = 5;

    // 4. 输入监听
    window.addEventListener("keydown", (e) => (keys[e.code] = true));
    window.addEventListener("keyup", (e) => (keys[e.code] = false));
    // window.addEventListener("keydown", (e) => {
    //   if (e.code === "Space") fire();
    // });

    // const fire = () => {
    //   const b = new PIXI.Graphics().circle(0, 0, 4).fill(0xff0000) as Bullet;
    //   b.x = tank1.x + Math.cos(tank1.rotation) * 30;
    //   b.y = tank1.y + Math.sin(tank1.rotation) * 30;
    //   b.vx = Math.cos(tank1.rotation) * bulletSpeed;
    //   b.vy = Math.sin(tank1.rotation) * bulletSpeed;
    //   b.bounces = 0;
    //   app.stage.addChild(b);
    //   bullets.push(b);
    // };

    // 5. 游戏循环
    app.ticker.add(() => {
      // 坦克移动逻辑
      if (keys["ArrowLeft"] || keys["KeyA"]) tank1.turnLeft();
      if (keys["ArrowRight"] || keys["KeyD"]) tank1.turnRight();
      if (keys["ArrowUp"] || keys["KeyW"]) tank1.moveForward();
      if (keys["ArrowDown"] || keys["KeyS"]) tank1.moveBackward();

      // 子弹移动与反弹逻辑
      // for (let i = bullets.length - 1; i >= 0; i--) {
      //   const b = bullets[i];
      //   b.x += b.vx;
      //   b.y += b.vy;

      //   // 边界检测 (模拟墙壁反弹)
      //   if (b.x < 0 || b.x > 800) {
      //     b.vx *= -1;
      //     b.bounces++;
      //   }
      //   if (b.y < 0 || b.y > 600) {
      //     b.vy *= -1;
      //     b.bounces++;
      //   }

      //   // 5秒后或反弹次数过多销毁子弹
      //   if (b.bounces > 5) {
      //     app.stage.removeChild(b);
      //     bullets.splice(i, 1);
      //   }
      // }
    });
  });

  onCleanup(() => {
    app.destroy(true, { children: true });
  });

  return <div ref={gameContainer} />;
};

export default TankGame;
