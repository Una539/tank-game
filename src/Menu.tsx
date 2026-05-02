import { createSignal } from 'solid-js';

/**
 * Menu 组件的 Props 接口。
 */
interface MenuProps {
  /** 点击"Single Player"按钮的回调。App.tsx 中切换至本地游戏模式。 */
  onLocalStart: () => void;

  /** 点击"Multiplayer"按钮的回调。App.tsx 中切换至多人游戏模式并连接服务器。 */
  onMultiplayerStart: () => void;
}

/**
 * 主菜单组件。
 * 游戏入口界面，提供两种游戏模式的选择：
 * - Single Player：本地单人游戏，无需网络连接
 * - Multiplayer：联网多人游戏，需要输入玩家名称并连接服务器
 *
 * 界面布局（从上到下）：
 * 1. 标题 "Tank Game"
 * 2. "Single Player" 按钮（橙色主按钮）
 * 3. 玩家名称输入框（placeholder: "Player Name"）
 * 4. "Multiplayer" 按钮（需要先输入名称才能点击）
 *
 * 与后端 `server/src/main.rs` 的对应：点击 Multiplayer 后前端会建立 WebSocket 连接。
 */
const Menu = (props: MenuProps) => {
  /** 玩家输入的名称。SolidJS 的 createSignal 创建响应式状态。 */
  const [playerName, setPlayerName] = createSignal('');

  /**
   * 处理点击多人游戏按钮。
   * 验证名称非空后保存到 localStorage（便于下次自动填充），
   * 然后调用 onMultiplayerStart 进入连接流程。
   */
  const handleMultiplayer = () => {
    if (playerName().trim()) {
      localStorage.setItem('tank_player_name', playerName().trim());
      props.onMultiplayerStart();
    }
  };

  return (
    <div class="menu-container">
      <h1>Tank Game</h1>
      <div class="menu-buttons">
        {/* Single Player 按钮：点击直接进入本地游戏 */}
        <button class="menu-btn" onClick={props.onLocalStart}>
          Single Player
        </button>
        <div class="multiplayer-section">
          {/* 玩家名称输入框：只有输入名称后才能点击 Multiplayer */}
          <input
            type="text"
            placeholder="Player Name"
            value={playerName()}
            onInput={(e) => setPlayerName(e.currentTarget.value)}
            class="menu-input"
          />
          <button class="menu-btn" onClick={handleMultiplayer}>
            Multiplayer
          </button>
        </div>
      </div>
    </div>
  );
};

export default Menu;
