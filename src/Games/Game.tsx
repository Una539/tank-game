import { onMount, onCleanup } from 'solid-js';
import * as PIXI from 'pixi.js';
import Tank from './tank';
import { MapGenerator, WallSegment } from './mapGenerator';
import Explosion from './explosion';

const TankGame = () => {
  let gameContainer: HTMLDivElement | undefined;
  const app = new PIXI.Application();

  let wasSpacePressed = false;
  let onKeyDown: ((e: KeyboardEvent) => void) | undefined;
  let onKeyUp: ((e: KeyboardEvent) => void) | undefined;

  onMount(async () => {
    // 1. 初始化画布
    await app.init({ width: 800, height: 800, backgroundColor: 0xeeeeee });
    if (gameContainer) gameContainer.appendChild(app.canvas);

    // 加载纹理
    const [gunTexture, bodyTexture] = await Promise.all([
      PIXI.Assets.load('assets/gun.svg'),
      PIXI.Assets.load('assets/body.svg'),
    ]);

    const mapGen = new MapGenerator(16, 16, 50);
    const wallsData: WallSegment[] = mapGen.generate(0.15);

    const mapGraphics = new PIXI.Graphics();
    // v8 API 设置线条样式
    mapGraphics.setStrokeStyle({ width: 4, color: 0x333333, cap: 'round' });

    for (const w of wallsData) {
      // 必须先移动画笔到起点，否则会和上一条线连起来
      mapGraphics.moveTo(w.x1, w.y1);
      mapGraphics.lineTo(w.x2, w.y2);
    }

    // 别忘了最后执行绘制指令
    mapGraphics.stroke();
    app.stage.addChild(mapGraphics);

    const tank1 = new Tank(gunTexture, bodyTexture, 75, 75);
    app.stage.addChild(tank1);

    // 3. 状态管理
    const keys: Record<string, boolean> = {};

    // 4. 输入监听
    onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
    };
    onKeyUp = (e: KeyboardEvent) => (keys[e.code] = false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const explosions: Explosion[] = [];
    const tanks = [tank1]; // 以后加坦克只改这里

    // 5. 游戏循环
    app.ticker.add(() => {
      const currentTime = performance.now();

      // 坦克移动逻辑
      if (keys['ArrowLeft'] || keys['KeyA']) tank1.turnLeft();
      if (keys['ArrowRight'] || keys['KeyD']) tank1.turnRight();
      if (keys['ArrowUp'] || keys['KeyW']) tank1.moveForward(wallsData);
      if (keys['ArrowDown'] || keys['KeyS']) tank1.moveBackward(wallsData);

      const spacePressed = keys['Space'];

      if (spacePressed && !wasSpacePressed) {
        tank1.onSpaceDown();
        tank1.fire(app.stage, currentTime);
      } else if (spacePressed && wasSpacePressed) {
        if (tank1.shotsRemaining > 0) {
          tank1.fire(app.stage, currentTime);
        }
      } else if (!spacePressed && wasSpacePressed) {
        tank1.onSpaceUp();
      }

      // 碰撞检测：所有子弹 vs 所有坦克
      for (const shooter of tanks) {
        for (const bullet of shooter.bullets) {
          if (!bullet.active) continue;
          if (performance.now() - bullet.spawnTime < 200) continue; // 加在这里

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

      // 更新爆炸动画
      for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.update(app.ticker.deltaMS);
        if (!exp.active) {
          exp.parent?.removeChild(exp);
          exp.destroy();
          explosions.splice(i, 1);
        }
      }

      // 只更新存活的坦克
      for (const tank of tanks) {
        if (!tank.isDead) tank.updateWithCollision(wallsData);
      }

      wasSpacePressed = spacePressed;
      tank1.updateWithCollision(wallsData);
    });
  });

  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown!);
    window.removeEventListener('keyup', onKeyUp!);
    app.destroy(true, { children: true });
  });

  return <div ref={gameContainer} />;
};

export default TankGame;
