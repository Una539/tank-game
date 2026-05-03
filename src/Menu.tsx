// Tank Game — 坦克大战
// Copyright (C) 2026 Una
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { createSignal } from 'solid-js';
import { t, locale, changeLocale } from './i18n';

/**
 * Menu 组件的 Props 接口。
 */
interface MenuProps {
  /** 点击"单人游戏"按钮的回调。App.tsx 中切换至本地游戏模式。 */
  onLocalStart: () => void;

  /** 点击"多人游戏"按钮的回调。App.tsx 中切换至多人游戏模式并连接服务器。 */
  onMultiplayerStart: (serverUrl: string) => void;
}

/**
 * 主菜单组件。
 * 游戏入口界面，提供两种游戏模式的选择：
 * - 单人游戏：本地单人游戏，无需网络连接
 * - 多人游戏：联网多人游戏，需要输入玩家名称并连接服务器
 *
 * 界面布局（从上到下）：
 * 1. 标题
 * 2. "单人游戏" 按钮
 * 3. 玩家名称输入框
 * 4. "多人游戏" 按钮（需要先输入名称才能点击）
 * 5. 语言切换按钮
 *
 * 与后端 `server/src/main.rs` 的对应：点击多人游戏后前端会建立 WebSocket 连接。
 */
const Menu = (props: MenuProps) => {
  /** 玩家输入的名称。SolidJS 的 createSignal 创建响应式状态。 */
  const [playerName, setPlayerName] = createSignal('');

  const [serverUrl, setServerUrl] = createSignal(
    localStorage.getItem('tank_server_url') || ''
  );

  /**
   * 处理点击多人游戏按钮。
   * 验证名称非空后保存到 localStorage（便于下次自动填充），
   * 然后调用 onMultiplayerStart 进入连接流程。
   */
  const handleMultiplayer = () => {
    if (playerName().trim()) {
      localStorage.setItem('tank_player_name', playerName().trim());
      props.onMultiplayerStart(serverUrl().trim());
    }
  };

  const toggleLocale = () => {
    changeLocale(locale() === 'zh' ? 'en' : 'zh');
  };

  return (
    <div class="menu-container">
      <button class="lang-switch" onClick={toggleLocale}>
        {t('menu.langSwitch')}
      </button>
      <h1>{t('menu.title')}</h1>
      <div class="menu-buttons">
        {/* 单人游戏按钮：点击直接进入本地游戏 */}
        <button class="menu-btn" onClick={props.onLocalStart}>
          {t('menu.singlePlayer')}
        </button>
        <div class="multiplayer-section">
          {/* 玩家名称输入框：只有输入名称后才能点击多人游戏 */}
          <input
            type="text"
            placeholder={t('menu.playerNamePlaceholder')}
            value={playerName()}
            onInput={(e) => setPlayerName(e.currentTarget.value)}
            class="menu-input"
          />
          <input
            type="text"
            placeholder={t('menu.serverUrlPlaceholder')}
            value={serverUrl()}
            onInput={(e) => setServerUrl(e.currentTarget.value)}
            class="menu-input"
          />
          <button class="menu-btn" onClick={handleMultiplayer}>
            {t('menu.multiplayer')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Menu;
