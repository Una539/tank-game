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
import { SegmentGroup } from '@ark-ui/solid/segment-group';
import { Field } from '@ark-ui/solid/field';
import { Globe } from 'lucide-solid';
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
 * 游戏入口界面，使用 Ark UI SegmentGroup 先选择游戏模式，再填写对应表单。
 */
const Menu = (props: MenuProps) => {
  /** 当前选中的游戏模式。 */
  const [mode, setMode] = createSignal<'single' | 'multiplayer'>('single');

  /** 玩家输入的名称。 */
  const [playerName, setPlayerName] = createSignal('');

  const [serverUrl, setServerUrl] = createSignal(
    localStorage.getItem('tank_server_url') || ''
  );

  /**
   * 处理点击开始按钮。
   * 单人模式直接进入本地游戏；多人模式验证名称后连接服务器。
   */
  const handleStart = () => {
    if (mode() === 'single') {
      props.onLocalStart();
    } else {
      if (playerName().trim()) {
        localStorage.setItem('tank_player_name', playerName().trim());
        props.onMultiplayerStart(serverUrl().trim());
      }
    }
  };

  const toggleLocale = () => {
    changeLocale(locale() === 'zh' ? 'en' : 'zh');
  };

  return (
    <div class="menu-container">
      <div class="card">
        <h1 class="card-title">{t('menu.title')}</h1>

        {/* 模式选择器 */}
        <SegmentGroup.Root
          value={mode()}
          onValueChange={(e) =>
            setMode(e.value as 'single' | 'multiplayer')
          }
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Item value="single">
            <SegmentGroup.ItemText>
              {t('menu.singlePlayer')}
            </SegmentGroup.ItemText>
            <SegmentGroup.ItemControl />
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
          <SegmentGroup.Item value="multiplayer">
            <SegmentGroup.ItemText>
              {t('menu.multiplayer')}
            </SegmentGroup.ItemText>
            <SegmentGroup.ItemControl />
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        </SegmentGroup.Root>

        {/* 多人模式表单 */}
        {mode() === 'multiplayer' && (
          <>
            <Field.Root>
              <Field.Label>{t('menu.playerNamePlaceholder')}</Field.Label>
              <Field.Input
                type="text"
                placeholder={t('menu.playerNamePlaceholder')}
                value={playerName()}
                onInput={(e) => setPlayerName(e.currentTarget.value)}
              />
            </Field.Root>

            <Field.Root>
              <Field.Label>{t('menu.serverUrlPlaceholder')}</Field.Label>
              <Field.Input
                type="text"
                placeholder={t('menu.serverUrlPlaceholder')}
                value={serverUrl()}
                onInput={(e) => setServerUrl(e.currentTarget.value)}
              />
            </Field.Root>
          </>
        )}

        {/* 开始按钮 */}
        <button
          class="btn btn-primary"
          onClick={handleStart}
          disabled={mode() === 'multiplayer' && !playerName().trim()}
        >
          {mode() === 'single'
            ? t('menu.singlePlayer')
            : t('menu.multiplayer')}
        </button>
      </div>

      {/* 语言切换 */}
      <button class="btn btn-ghost" onClick={toggleLocale}>
        <Globe size={16} />
        {t('menu.langSwitch')}
      </button>
    </div>
  );
};

export default Menu;
