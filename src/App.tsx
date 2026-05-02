import { createSignal, Show } from 'solid-js';
import TankGame from './Games/Game';
import Menu from './Menu';
import Lobby from './Lobby';
import { GameClient } from './network/client';
import type { WallSegment } from './Games/mapGenerator';

/**
 * 应用状态类型。
 * 'menu' = 主菜单，'lobby' = 多人游戏大厅，'game' = 游戏中。
 */
type AppMode = 'menu' | 'lobby' | 'game';

/**
 * 游戏模式类型。
 * 'local' = 本地单人，'multiplayer' = 联网多人。
 */
type GameMode = 'local' | 'multiplayer';

/**
 * 应用根组件。
 * 作为整个应用的状态机（State Machine），管理三个顶层场景的切换：
 * 1. Menu（菜单）→ 选择游戏模式
 * 2. Lobby（大厅）→ 创建/加入房间、准备
 * 3. Game（游戏）→ 实际游戏画面
 *
 * 使用 SolidJS 的 `Show` 组件进行条件渲染：当条件为真时渲染对应分支。
 * 这与 React 的 `{condition && <Component />}` 类似，但 `Show` 是 SolidJS 的内置组件，
 * 对响应式条件有更好的性能优化（避免不必要的组件创建/销毁）。
 */
const App = () => {
  /** 当前应用模式。控制显示哪个顶层场景。 */
  const [mode, setMode] = createSignal<AppMode>('menu');

  /** 当前游戏模式。'local' 或 'multiplayer'，影响 TankGame 组件的行为。 */
  const [gameMode, setGameMode] = createSignal<GameMode>('local');

  /**
   * WebSocket 客户端实例。
   * 使用 createSignal 包装：虽然 GameClient 实例本身不变，但 Signal 是 SolidJS 的响应式原语，
   * 确保子组件在访问时能获得一致引用。实际更简洁的做法是直接 `const client = new GameClient(...)`，
   * 但 createSignal 是 SolidJS 社区中管理"可能变化的全局状态"的常见习惯。
   */
  const [client] = createSignal(new GameClient('ws://localhost:8080'));

  /** 服务器下发的地图墙壁数据。仅在多人模式下使用。 */
  const [serverWalls, setServerWalls] = createSignal<WallSegment[]>([]);

  /** 当前玩家名称。从 localStorage 读取或用户输入。 */
  const [playerName, setPlayerName] = createSignal('');

  /**
   * 处理开始本地游戏。
   * 设置游戏模式为 local，切换到游戏场景。
   */
  const handleLocalStart = () => {
    setGameMode('local');
    setMode('game');
  };

  /**
   * 处理开始多人游戏。
   * 从 localStorage 读取之前保存的玩家名称（如果有），
   * 设置游戏模式为 multiplayer，切换到大厅场景，并连接 WebSocket 服务器。
   */
  const handleMultiplayerStart = () => {
    const name = localStorage.getItem('tank_player_name') || 'Player';
    setPlayerName(name);
    setGameMode('multiplayer');
    setMode('lobby');

    // 异步连接服务器。catch 处理连接失败（如服务器未启动）。
    client().connect().catch((e) => {
      console.error('Failed to connect to server:', e);
      alert('Failed to connect to server. Make sure the server is running on port 8080.');
    });
  };

  /**
   * 处理游戏开始（从大厅进入游戏）。
   * 收到服务器的 GameStart 包后调用，保存地图数据并切换到游戏场景。
   *
   * @param walls - 服务器生成的地图墙壁数据
   */
  const handleGameStart = (walls: WallSegment[]) => {
    console.log('[App] handleGameStart, walls:', walls);
    setServerWalls(walls);
    setMode('game');
  };

  /**
   * 处理游戏结束。
   * 3 秒后自动切换场景：多人模式回到大厅（保持连接），本地模式回到菜单。
   * 使用 setTimeout 而非 async/await：延迟场景切换是简单的副作用，不需要复杂的异步控制。
   */
  const handleGameOver = () => {
    setTimeout(() => {
      if (gameMode() === 'multiplayer') {
        // 联机模式下回到大厅准备下一把，保持连接
        client().sendLeave();
        setMode('lobby');
      } else {
        setMode('menu');
      }
    }, 3000);
  };

  return (
    <div class="app-container">
      {/* 菜单场景 */}
      <Show when={mode() === 'menu'}>
        <Menu
          onLocalStart={handleLocalStart}
          onMultiplayerStart={handleMultiplayerStart}
        />
      </Show>

      {/* 大厅场景 */}
      <Show when={mode() === 'lobby'}>
        <Lobby
          client={client()}
          onGameStart={handleGameStart}
          playerName={playerName()}
        />
      </Show>

      {/* 游戏场景 */}
      <Show when={mode() === 'game'}>
        <TankGame
          mode={gameMode()}
          client={gameMode() === 'multiplayer' ? client() : undefined}
          serverWalls={gameMode() === 'multiplayer' ? serverWalls() : undefined}
          playerId={gameMode() === 'multiplayer' ? client().playerId || undefined : undefined}
          onGameOver={handleGameOver}
        />
      </Show>
    </div>
  );
};

export default App;
