import { onMount, onCleanup } from 'solid-js';
import * as PIXI from 'pixi.js';
import Tank from './tank';

const TankGame = () => {
  let gameContainer: HTMLDivElement | undefined;
  const app = new PIXI.Application();

  let wasSpacePressed = false;
  let onKeyDown: ((e: KeyboardEvent) => void) | undefined;
  let onKeyUp: ((e: KeyboardEvent) => void) | undefined;

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
    onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
    };
    onKeyUp = (e: KeyboardEvent) => (keys[e.code] = false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 5. 游戏循环
    app.ticker.add(() => {
      const currentTime = performance.now();

      // 坦克移动逻辑
      if (keys['ArrowLeft'] || keys['KeyA']) tank1.turnLeft();
      if (keys['ArrowRight'] || keys['KeyD']) tank1.turnRight();
      if (keys['ArrowUp'] || keys['KeyW']) tank1.moveForward();
      if (keys['ArrowDown'] || keys['KeyS']) tank1.moveBackward();

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

      wasSpacePressed = spacePressed;
      tank1.update(app.screen.width, app.screen.height);
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
