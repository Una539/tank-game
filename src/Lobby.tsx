// Tank Game — 坦克大战
// Copyright (C) 2026
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

import { createSignal, onMount, onCleanup } from 'solid-js';
import { GameClient } from './network/client';
import type { RoomPlayer } from './network/types';
import type { WallSegment } from './Games/mapGenerator';

/**
 * Lobby 组件的 Props 接口。
 */
interface LobbyProps {
  /** WebSocket 客户端实例。由 App.tsx 创建并传入，用于发送 Join/Ready/Leave 等消息。 */
  client: GameClient;

  /** 游戏开始回调。收到服务器 GameStart 包时触发，携带地图墙壁数据。 */
  onGameStart: (walls: WallSegment[]) => void;

  /** 当前玩家的显示名称。从 App.tsx 传入，用于 Join 请求。 */
  playerName: string;
}

/**
 * 游戏大厅组件。
 * 多人模式下的等待/准备界面，功能包括：
 * 1. 创建房间（自动生成 6 位房间 ID）
 * 2. 加入房间（输入已有房间 ID）
 * 3. 查看房间内玩家列表和准备状态
 * 4. 切换自己的 Ready/Unready 状态
 * 5. 离开房间
 *
 * 界面状态（两种模式）：
 * - 未加入房间：显示 "Create Room" 按钮 + 房间 ID 输入框 + "Join Room" 按钮
 * - 已加入房间：显示房间 ID + 玩家列表（含 Ready 状态）+ "Ready/Unready" 按钮 + "Leave Room" 按钮
 *
 * 与后端 `server/src/rooms/manager.rs` 的 `RoomManager` 和 `Room` 对应：
 * 本组件是房间状态的可视化呈现，通过网络协议与后端同步。
 */
const Lobby = (props: LobbyProps) => {
  /** 当前加入的房间 ID。空字符串表示未加入任何房间。 */
  const [roomId, setRoomId] = createSignal('');

  /** 房间 ID 输入框的值。用于加入已有房间。 */
  const [joinInput, setJoinInput] = createSignal('');

  /** 房间内所有玩家列表。由服务器的 RoomUpdate 包更新。 */
  const [players, setPlayers] = createSignal<RoomPlayer[]>([]);

  /** 当前玩家是否为房主。由 RoomUpdate 包中的 is_owner 字段确定。 */
  const [isOwner, setIsOwner] = createSignal(false);

  /** 错误消息。操作失败时显示（如房间已满）。 */
  const [error, setError] = createSignal('');

  /**
   * 组件挂载时注册网络事件处理器。
   * SolidJS 的 onMount 在 DOM 插入后执行，适合注册外部事件监听。
   */
  onMount(() => {
    console.log('[Lobby] Mounted, client playerId:', props.client.playerId);

    // 注册 Welcome 处理器：连接成功后服务器分配 playerId
    props.client.onWelcome((playerId, serverTick) => {
      console.log('[Lobby] Welcome received, playerId:', playerId, 'serverTick:', serverTick);
      console.log('[Lobby] client.playerId after welcome:', props.client.playerId);
    });

    // 注册 RoomUpdate 处理器：刷新玩家列表和房主状态
    props.client.onRoomUpdate((updatedPlayers) => {
      console.log('[Lobby] onRoomUpdate callback fired:', updatedPlayers);
      setPlayers(updatedPlayers);
      const me = updatedPlayers.find((p) => p.id === props.client.playerId);
      if (me) {
        console.log('[Lobby] Found me in update, isOwner:', me.is_owner);
        setIsOwner(me.is_owner);
      }
    });

    // 注册 GameStart 处理器：收到后解析地图数据并进入游戏
    props.client.onGameStart((_seed, mapData, _tick) => {
      console.log('[Lobby] GameStart received, walls:', mapData.walls?.length);
      // 将后端 WallType 枚举转换为前端 'h'/'v' 字符串
      const walls: WallSegment[] = mapData.walls.map((w: any) => ({
        x1: w.x1,
        y1: w.y1,
        x2: w.x2,
        y2: w.y2,
        type: (w.wall_type === 'Horizontal' ? 'h' : 'v') as 'h' | 'v',
      }));
      console.log('[Lobby] Transformed walls:', walls);
      props.onGameStart(walls);
    });

    // 注册 Error 处理器：显示错误消息
    props.client.onError((_code, message) => {
      setError(message);
    });
  });

  onCleanup(() => {
    // nothing to clean up
  });

  /**
   * 创建新房间。
   * 生成随机 6 位房间 ID，发送 Join 请求（后端会自动创建不存在的房间）。
   */
  const handleCreateRoom = () => {
    setError('');
    const newRoomId = generateRoomId();
    props.client.joinRoom(newRoomId, props.playerName);
    setRoomId(newRoomId);
  };

  /**
   * 加入已有房间。
   * 读取输入框中的房间 ID，发送 Join 请求。
   */
  const handleJoinRoom = () => {
    setError('');
    if (joinInput().trim()) {
      props.client.joinRoom(joinInput().trim(), props.playerName);
      setRoomId(joinInput().trim());
    }
  };

  /**
   * 切换准备状态。
   * 点击 "Ready" 变为 "Unready"，反之亦然。
   * 发送 Ready 包给服务器，服务器广播 RoomUpdate 并检查是否全部就绪。
   */
  const handleReady = () => {
    console.log('[Lobby] handleReady called');
    console.log('[Lobby] Current players:', players());
    console.log('[Lobby] Client playerId:', props.client.playerId);
    console.log('[Lobby] Client roomId:', props.client.roomId);
    props.client.sendReady();
  };

  /**
   * 离开当前房间。
   * 发送 Leave 包，重置本地状态。
   */
  const handleLeave = () => {
    props.client.sendLeave();
    setRoomId('');
    setPlayers([]);
    setIsOwner(false);
    setError('');
  };

  /**
   * 检查是否所有玩家都已准备。
   * 要求至少 2 人。用于在房主视角显示 "All players ready! Starting..." 提示。
   *
   * @returns true 表示所有玩家准备就绪且人数 >= 2
   */
  const allReady = () => {
    const p = players();
    return p.length >= 2 && p.every((player) => player.ready);
  };

  return (
    <div class="lobby-container">
      <h2>Lobby</h2>

      {/* 错误提示 */}
      {error() && <div class="lobby-error">{error()}</div>}

      {/* 未加入房间：显示创建/加入界面 */}
      {!roomId() ? (
        <div class="lobby-setup">
          <button class="lobby-btn" onClick={handleCreateRoom}>
            Create Room
          </button>
          <div class="lobby-join">
            <input
              type="text"
              placeholder="Or enter Room ID to join"
              value={joinInput()}
              onInput={(e) => setJoinInput(e.currentTarget.value)}
              class="lobby-input"
            />
            <button class="lobby-btn" onClick={handleJoinRoom}>
              Join Room
            </button>
          </div>
        </div>
      ) : (
        /* 已加入房间：显示房间信息和玩家列表 */
        <div class="lobby-room">
          <div class="room-id">Room: {roomId()}</div>

          {/* 玩家列表 */}
          <div class="player-list">
            <h3>Players ({players().length}/4)</h3>
            {players().map((player) => (
              <div class={`player-item ${player.ready ? 'ready' : ''}`}>
                <span class="player-name">
                  {player.name} {player.is_owner && '(Owner)'}
                </span>
                <span class="player-status">
                  {player.ready ? '✓ Ready' : 'Not Ready'}
                </span>
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          <div class="lobby-actions">
            {/* Ready/Unready 按钮：切换自己的准备状态 */}
            <button class="lobby-btn ready-btn" onClick={handleReady}>
              {players().find((p) => p.id === props.client.playerId)?.ready
                ? 'Unready'
                : 'Ready'}
            </button>
            {/* 房主视角：所有人就绪后显示开始提示 */}
            {allReady() && isOwner() && (
              <div class="room-starting">All players ready! Starting...</div>
            )}
            {/* Leave Room 按钮 */}
            <button class="lobby-btn leave-btn" onClick={handleLeave}>
              Leave Room
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 生成随机房间 ID。
 * 6 位小写字母+数字组合，共 36^6 ≈ 21 亿种可能，碰撞概率极低。
 * 与后端 `server/src/rooms/manager.rs` 的 `generate_room_id` 方法对应。
 *
 * @returns 新生成的房间 ID
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
