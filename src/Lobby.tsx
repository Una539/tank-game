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

import { createSignal, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Field } from '@ark-ui/solid/field';
import { Switch } from '@ark-ui/solid/switch';
import { Dialog } from '@ark-ui/solid/dialog';
import {
  Users,
  LogOut,
  Swords,
  DoorOpen,
  AlertCircle,
} from 'lucide-solid';
import { t } from './i18n';
import { GameClient } from './network/client';
import type { RoomPlayer } from './network/types';
import type { WallSegment } from './Games/mapGenerator';

/**
 * Lobby 组件的 Props 接口。
 */
interface LobbyProps {
  /** WebSocket 客户端实例。 */
  client: GameClient;

  /** 游戏开始回调。 */
  onGameStart: (walls: WallSegment[]) => void;

  /** 当前玩家的显示名称。 */
  playerName: string;
}

/**
 * 游戏大厅组件。
 * 使用 Ark UI Field、Switch、Dialog 重构为中性风格界面。
 */
const Lobby = (props: LobbyProps) => {
  const [roomId, setRoomId] = createSignal('');
  const [joinInput, setJoinInput] = createSignal('');
  const [players, setPlayers] = createSignal<RoomPlayer[]>([]);
  const [isOwner, setIsOwner] = createSignal(false);
  const [error, setError] = createSignal('');
  const [errorOpen, setErrorOpen] = createSignal(false);

  onMount(() => {
    props.client.onWelcome((playerId) => {
      console.log('[Lobby] Welcome received, playerId:', playerId);
    });

    props.client.onRoomUpdate((updatedPlayers) => {
      setPlayers(updatedPlayers);
      const me = updatedPlayers.find((p) => p.id === props.client.playerId);
      if (me) {
        setIsOwner(me.is_owner);
      }
    });

    props.client.onGameStart((_seed, mapData, _tick) => {
      const walls: WallSegment[] = mapData.walls.map((w: any) => ({
        x1: w.x1,
        y1: w.y1,
        x2: w.x2,
        y2: w.y2,
        type: (w.wall_type === 'Horizontal' ? 'h' : 'v') as 'h' | 'v',
      }));
      props.onGameStart(walls);
    });

    props.client.onError((_code, message) => {
      setError(message);
      setErrorOpen(true);
    });
  });

  const handleCreateRoom = () => {
    setError('');
    const newRoomId = generateRoomId();
    props.client.joinRoom(newRoomId, props.playerName);
    setRoomId(newRoomId);
  };

  const handleJoinRoom = () => {
    setError('');
    if (joinInput().trim()) {
      props.client.joinRoom(joinInput().trim(), props.playerName);
      setRoomId(joinInput().trim());
    }
  };

  const handleReadyToggle = () => {
    props.client.sendReady();
  };

  const handleLeave = () => {
    props.client.sendLeave();
    setRoomId('');
    setPlayers([]);
    setIsOwner(false);
    setError('');
  };

  const allReady = () => {
    const p = players();
    return p.length >= 2 && p.every((player) => player.ready);
  };

  const meReady = () => {
    const me = players().find((p) => p.id === props.client.playerId);
    return me?.ready ?? false;
  };

  return (
    <div class="lobby-container">
      {/* 错误弹窗 */}
      <Dialog.Root
        open={errorOpen()}
        onOpenChange={(e) => {
          setErrorOpen(e.open);
          if (!e.open) setError('');
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Title
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '8px',
                  color: '#dc2626',
                }}
              >
                <AlertCircle size={20} />
                {t('lobby.errorTitle')}
              </Dialog.Title>
              <Dialog.Description>{error()}</Dialog.Description>
              <button
                class="btn btn-primary"
                onClick={() => {
                  setErrorOpen(false);
                  setError('');
                }}
              >
                {t('lobby.ok')}
              </button>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <div class="card">
        <h2 class="card-title">{t('lobby.title')}</h2>

        {!roomId() ? (
          <div class="lobby-setup">
            <button class="btn btn-primary" onClick={handleCreateRoom}>
              <Swords size={18} />
              {t('lobby.createRoom')}
            </button>

            <div class="divider">{t('lobby.or')}</div>

            <div class="lobby-join">
              <Field.Root>
                <Field.Label>{t('lobby.joinPlaceholder')}</Field.Label>
                <Field.Input
                  type="text"
                  placeholder={t('lobby.joinPlaceholder')}
                  value={joinInput()}
                  onInput={(e) => setJoinInput(e.currentTarget.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && handleJoinRoom()
                  }
                />
              </Field.Root>
              <button class="btn btn-secondary" onClick={handleJoinRoom}>
                <DoorOpen size={18} />
                {t('lobby.joinRoom')}
              </button>
            </div>
          </div>
        ) : (
          <div class="lobby-room">
            <div class="room-header">
              <span class="room-label">{t('lobby.roomLabelPrefix')}</span>
              <div class="room-id">{roomId()}</div>
            </div>

            <div class="player-list">
              <div
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '8px',
                  'margin-bottom': '4px',
                }}
              >
                <Users size={16} color="#a3a3a3" />
                <span
                  style={{
                    'font-size': '0.8125rem',
                    'font-weight': '600',
                    color: '#a3a3a3',
                  }}
                >
                  {t('lobby.playersTitle', {
                    count: String(players().length),
                  })}
                </span>
              </div>
              {players().map((player) => (
                <div
                  class={`player-item ${player.ready ? 'ready' : ''}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '8px',
                    }}
                  >
                    <span class="player-name">{player.name}</span>
                    {player.is_owner && (
                      <span class="player-badge">{t('lobby.owner')}</span>
                    )}
                  </div>
                  <span
                    class={`player-status ${player.ready ? 'ready' : ''}`}
                  >
                    {player.ready
                      ? t('lobby.readyStatus')
                      : t('lobby.notReadyStatus')}
                  </span>
                </div>
              ))}
            </div>

            <div class="actions">
              <Switch.Root
                checked={meReady()}
                onCheckedChange={() => handleReadyToggle()}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.Label>
                  {meReady()
                    ? t('lobby.unreadyBtn')
                    : t('lobby.readyBtn')}
                </Switch.Label>
                <Switch.HiddenInput />
              </Switch.Root>

              {allReady() && isOwner() && (
                <div class="all-ready">
                  {t('lobby.allReadyStarting')}
                </div>
              )}

              <button class="btn btn-secondary" onClick={handleLeave}>
                <LogOut size={18} />
                {t('lobby.leaveRoom')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 生成随机房间 ID。
 */
function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default Lobby;
