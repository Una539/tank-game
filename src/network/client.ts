import type {
  KeyState,
  PlayerSnapshot,
  BulletSnapshot,
  ExplosionSnapshot,
  WallSegment,
  MapData,
  RoomPlayer,
  ClientPacket,
  ServerPacket,
} from './types';

/** 欢迎包处理器类型。接收服务器分配的 playerId 和初始 tick。 */
type WelcomeHandler = (playerId: string, serverTick: number) => void;

/** 房间状态更新处理器类型。接收房间内所有玩家列表。 */
type RoomUpdateHandler = (players: RoomPlayer[]) => void;

/** 游戏开始处理器类型。接收地图种子、地图数据和初始 tick。 */
type GameStartHandler = (seed: number, map: MapData, serverTick: number) => void;

/** 游戏状态同步处理器类型。接收每 tick 的权威状态快照。 */
type StateHandler = (
  tick: number,
  players: PlayerSnapshot[],
  bullets: BulletSnapshot[],
  explosions: ExplosionSnapshot[]
) => void;

/** 游戏结束处理器类型。接收获胜者 playerId（可能为 null 表示平局）。 */
type GameOverHandler = (winner: string | null) => void;

/** 错误处理器类型。接收错误码和错误消息。 */
type ErrorHandler = (code: string, message: string) => void;

/**
 * WebSocket 游戏客户端。
 * 封装了与后端 `server/src/main.rs` 的 WebSocket 通信，
 * 负责协议包的序列化/反序列化、连接管理、事件分发。
 * 采用"事件处理器注册"模式（Observer Pattern）：上层通过 `onXxx` 方法注册回调，
 * 网络层在收到对应包时触发回调。这种解耦设计是游戏客户端的常见做法。
 */
export class GameClient {
  /** WebSocket 实例。null 表示未连接或已断开。 */
  private ws: WebSocket | null = null;

  /** 服务器 WebSocket URL。默认 'ws://localhost:8080'，与后端监听地址一致。 */
  private url: string;

  /** 服务器分配的玩家唯一 ID。在收到 Welcome 包后设置。 */
  public playerId: string | null = null;

  /** 当前加入的房间 ID。在调用 joinRoom 后设置，离开或断开时重置为 null。 */
  public roomId: string | null = null;

  /** 连接状态标记。true 表示 WebSocket 已打开且握手完成。 */
  public connected = false;

  /** 欢迎包回调。收到 ServerPacket::Welcome 时触发。 */
  private onWelcomeHandler?: WelcomeHandler;

  /** 房间更新回调。收到 ServerPacket::RoomUpdate 时触发。 */
  private onRoomUpdateHandler?: RoomUpdateHandler;

  /** 游戏开始回调。收到 ServerPacket::GameStart 时触发。 */
  private onGameStartHandler?: GameStartHandler;

  /** 状态同步回调。收到 ServerPacket::State 时触发，每 tick 一次。 */
  private onStateHandler?: StateHandler;

  /** 游戏结束回调。收到 ServerPacket::GameOver 时触发。 */
  private onGameOverHandler?: GameOverHandler;

  /** 错误回调。收到 ServerPacket::Error 时触发。 */
  private onErrorHandler?: ErrorHandler;

  /**
   * 待发送包队列。连接未就绪时（如刚调用 connect 但 WebSocket 还在握手），
   * 将包暂存于此，连接成功后自动发送。这是网络编程中"连接前排队"的标准做法。
   */
  private pendingPackets: ClientPacket[] = [];

  /**
   * 创建客户端实例。
   *
   * @param url - WebSocket 服务器地址，如 'ws://localhost:8080'
   */
  constructor(url: string) {
    this.url = url;
  }

  /**
   * 建立 WebSocket 连接。
   * 如果已连接或正在连接，返回已 resolve 的 Promise。
   * 为什么用 Promise：便于上层用 async/await 等待连接就绪后再发送消息。
   *
   * @returns Promise，resolve 表示连接成功，reject 表示连接失败
   */
  connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.connected = true;
        // 发送排队中的消息
        for (const packet of this.pendingPackets) {
          this.sendPacketNow(packet);
        }
        this.pendingPackets = [];
        resolve();
      };

      this.ws.onclose = () => {
        this.connected = false;
      };

      this.ws.onerror = (e) => {
        reject(e);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * 处理收到的服务器消息。
   * 服务器目前使用 JSON 序列化（原计划用 Postcard 二进制），
   * 所以这里先判断 ArrayBuffer 并用 TextDecoder 解码为字符串，再 JSON.parse。
   * 与后端 `server/src/main.rs` 中 `serde_json::to_vec` 的序列化方式对应。
   *
   * @param data - WebSocket 消息数据，可能是 ArrayBuffer 或 string
   */
  private handleMessage(data: any) {
    try {
      let text: string;
      if (data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(data);
      } else {
        text = data;
      }
      const packet: ServerPacket = JSON.parse(text);
      console.log('[Client] Received packet:', packet.type, packet);

      switch (packet.type) {
        case 'Welcome':
          this.playerId = packet.player_id;
          console.log('[Client] Welcome, playerId set to:', this.playerId);
          this.onWelcomeHandler?.(packet.player_id, packet.server_tick);
          break;
        case 'RoomUpdate':
          this.onRoomUpdateHandler?.(packet.players);
          break;
        case 'GameStart':
          this.onGameStartHandler?.(packet.seed, packet.map, packet.server_tick);
          break;
        case 'State':
          this.onStateHandler?.(packet.tick, packet.players, packet.bullets, packet.explosions);
          break;
        case 'Pong':
          break;
        case 'GameOver':
          this.onGameOverHandler?.(packet.winner);
          break;
        case 'Error':
          this.onErrorHandler?.(packet.code, packet.message);
          break;
      }
    } catch (e) {
      console.error('Failed to parse server packet:', e);
    }
  }

  /**
   * 立即发送协议包。要求 WebSocket 已处于 OPEN 状态。
   * 将 JSON 对象转为 Uint8Array 发送：与后端期望的 Binary 消息格式一致。
   *
   * @param packet - 要发送的客户端协议包
   */
  private sendPacketNow(packet: ClientPacket) {
    console.log('[Client] Sending packet:', packet.type, packet);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const encoded = new TextEncoder().encode(JSON.stringify(packet));
      this.ws.send(encoded);
    }
  }

  /**
   * 发送协议包（带连接状态检查）。
   * 如果未连接，将包加入 pendingPackets 队列，连接成功后自动补发。
   * 这是网络客户端的健壮性设计：避免连接抖动导致的消息丢失。
   *
   * @param packet - 要发送的客户端协议包
   */
  private sendPacket(packet: ClientPacket) {
    if (this.connected) {
      this.sendPacketNow(packet);
    } else {
      console.warn('[Client] WebSocket not open, queuing packet:', packet.type);
      this.pendingPackets.push(packet);
    }
  }

  /**
   * 请求加入房间。
   * 发送 ClientPacket::Join，后端 `server/src/main.rs` 的 Join 分支处理。
   * 如果房间不存在则自动创建（后端逻辑）。
   *
   * @param roomId - 房间 ID，6 位字母数字组合
   * @param playerName - 玩家显示名称
   */
  joinRoom(roomId: string, playerName: string) {
    console.log('[Client] joinRoom called, roomId:', roomId, 'playerName:', playerName);
    this.roomId = roomId;
    this.sendPacket({ type: 'Join', room_id: roomId, player_name: playerName });
  }

  /**
   * 发送输入状态。
   * 每帧（或每 tick）调用，将当前按键状态同步给服务器。
   * 与后端 `server/src/main.rs` 的 Input 分支对应，
   * 后端将输入存入 `GameState::queue_input` 供权威 tick 处理。
   *
   * @param keys - 当前按键状态
   * @param tick - 客户端本地 tick 计数，用于后端输入对齐
   */
  sendInput(keys: KeyState, tick: number) {
    this.sendPacket({
      type: 'Input',
      tick,
      keys,
      timestamp: Date.now(),
    });
  }

  /**
   * 发送开火请求。
   * 与 sendInput 分离：因为开火是一次性事件而非持续状态，
   * 需要独立包类型以便后端精确处理时机。
   * 与后端 `server/src/main.rs` 的 Fire 分支对应。
   */
  sendFire() {
    this.sendPacket({
      type: 'Fire',
      timestamp: Date.now(),
    });
  }

  /**
   * 发送准备就绪状态。
   * 切换当前玩家的 ready/unready 状态。
   * 与后端 `server/src/main.rs` 的 Ready 分支对应，
   * 后端检查所有玩家 ready 后自动开始游戏。
   */
  sendReady() {
    console.log('[Client] Sending Ready packet');
    this.sendPacket({ type: 'Ready' });
  }

  /**
   * 发送离开房间请求。
   * 断开与当前房间的关联，但保持 WebSocket 连接。
   * 与后端 `server/src/main.rs` 的 Leave 分支对应。
   */
  sendLeave() {
    this.sendPacket({ type: 'Leave' });
    this.roomId = null;
  }

  /**
   * 发送心跳 Ping。
   * 当前未在前端主动调用，但预留用于未来延迟测量（RTT）。
   * 与后端 `server/src/main.rs` 的 Ping 分支对应。
   *
   * @param clientTick - 客户端当前 tick
   */
  sendPing(clientTick: number) {
    this.sendPacket({ type: 'Ping', client_tick: clientTick });
  }

  /**
   * 注册欢迎包处理器。
   * 在 `Lobby.tsx` 中注册，用于确认连接成功。
   *
   * @param handler - 回调函数
   */
  onWelcome(handler: WelcomeHandler) {
    this.onWelcomeHandler = handler;
  }

  /**
   * 注册房间更新处理器。
   * 在 `Lobby.tsx` 中注册，用于刷新玩家列表和准备状态。
   *
   * @param handler - 回调函数
   */
  onRoomUpdate(handler: RoomUpdateHandler) {
    this.onRoomUpdateHandler = handler;
  }

  /**
   * 注册游戏开始处理器。
   * 在 `Lobby.tsx` 中注册，收到后切换至游戏场景。
   *
   * @param handler - 回调函数
   */
  onGameStart(handler: GameStartHandler) {
    this.onGameStartHandler = handler;
  }

  /**
   * 注册状态同步处理器。
   * 在 `Game.tsx` 中注册，是多人模式下游戏状态更新的核心入口。
   * 每 tick 收到一次权威状态，用于校正本地预测。
   *
   * @param handler - 回调函数
   */
  onState(handler: StateHandler) {
    this.onStateHandler = handler;
  }

  /**
   * 注册游戏结束处理器。
   * 在 `Game.tsx` 中注册，收到后触发 gameOver 状态。
   *
   * @param handler - 回调函数
   */
  onGameOver(handler: GameOverHandler) {
    this.onGameOverHandler = handler;
  }

  /**
   * 注册错误处理器。
   * 在 `Lobby.tsx` 中注册，用于显示房间错误（如已满、未开始等）。
   *
   * @param handler - 回调函数
   */
  onError(handler: ErrorHandler) {
    this.onErrorHandler = handler;
  }

  /**
   * 主动断开 WebSocket 连接。
   * 通常在组件卸载或页面关闭时调用。
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
